"""
Career Prediction Flask API
=============================
REST endpoints:
  POST /predict           — top-N career recommendations
  POST /predict/batch     — batch predictions
  POST /predict/explain   — full prediction with feature drivers
  GET  /careers           — career catalogue
  GET  /health | /healthz — liveness + readiness
  GET  /metrics           — model performance metrics
  GET  /features          — feature schema
  GET  /example           — sample request body

Memory contract
---------------
Models are NOT loaded at import or create_app() time.  A background
daemon thread (started in wsgi.py) loads them after the socket is bound.
All predict endpoints gate on CareerPredictor._instance being ready and
return HTTP 503 until the warmup thread completes (typically 5–15 s).
/healthz always returns HTTP 200 — Render requires this to mark the
service as live.  The "ready" field in the body indicates model state.
"""

import os
import sys
import json
import time
import logging
import traceback
from pathlib import Path
from functools import wraps
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g
from flask_cors import CORS

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.predict import get_predictor, RAW_FEATURES, CAREER_NARRATIVES, CareerPredictor
from data.generate_dataset import CAREERS  # noqa: F401 — kept for catalogue compat

logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("career_api")


def create_app(testing: bool = False) -> Flask:
    app = Flask(__name__)
    app.config["TESTING"]      = testing
    app.config["JSON_SORT_KEYS"] = False

    CORS(app, origins=os.getenv("ALLOWED_ORIGINS", "*").split(","))

    # ── Request timing ─────────────────────────────────────────────
    @app.before_request
    def _start_timer():
        g.start = time.perf_counter()

    @app.after_request
    def _add_headers(response):
        if hasattr(g, "start"):
            elapsed_ms = round((time.perf_counter() - g.start) * 1000, 2)
            response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
        response.headers["X-API-Version"] = "1.0.0"
        return response

    # ── Error handlers ─────────────────────────────────────────────
    def _error(code: int, message: str, details=None) -> tuple:
        body = {"status": "error", "code": code, "message": message}
        if details is not None:
            body["details"] = details
        return jsonify(body), code

    @app.errorhandler(404)
    def not_found(e):
        return _error(404, f"Endpoint not found: {request.path}")

    @app.errorhandler(405)
    def method_not_allowed(e):
        return _error(405, f"Method {request.method} not allowed on {request.path}")

    @app.errorhandler(Exception)
    def unhandled(e):
        logger.error("Unhandled exception: %s", traceback.format_exc())
        return _error(500, "Internal server error")

    # ── Auth guard ─────────────────────────────────────────────────
    API_TOKEN = os.getenv("AI_SERVICE_SECRET", "")

    def require_internal_token(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if API_TOKEN:
                token = request.headers.get("X-Internal-Token", "")
                if token != API_TOKEN:
                    return _error(401, "Invalid or missing X-Internal-Token header")
            return f(*args, **kwargs)
        return decorated

    # ── Lazy predictor accessor ────────────────────────────────────
    def _get_predictor():
        """
        Return (predictor, None) if ready, or (None, error_str) if not.
        Does NOT block — if the warmup thread hasn't finished yet, returns
        (None, "warming_up") so the endpoint can return 503 immediately.
        """
        inst = CareerPredictor._instance
        if inst is not None and inst._loaded:
            return inst, None
        # Singleton not ready — warmup thread is still running (or failed).
        # Try to get it; if it raises or blocks more than we want, let the
        # caller handle the 503.
        try:
            p = get_predictor()   # returns instantly if already loaded
            return p, None
        except Exception as exc:
            logger.error("Predictor unavailable: %s", exc)
            return None, str(exc)

    # ── /healthz — ALWAYS 200 so Render marks service as live ─────
    @app.route("/health",  methods=["GET"])
    @app.route("/healthz", methods=["GET"])
    def health():
        inst  = CareerPredictor._instance
        ready = inst is not None and inst._loaded
        body  = {
            "status"   : "ok",                                    # always ok
            "ready"    : ready,
            "model"    : "loaded" if ready else "warming_up",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version"  : "1.0.0",
        }
        # Always HTTP 200 — Render kills the service if health returns non-2xx.
        # The "ready" field tells callers whether predictions are available.
        return jsonify(body), 200

    # ── /features ──────────────────────────────────────────────────
    @app.route("/features", methods=["GET"])
    def features():
        schema = {
            feat: {
                "type":        "number",
                "min":          0,
                "max":          100,
                "description":  _feat_description(feat),
                "unit":         "score (0–100)",
            }
            for feat in RAW_FEATURES
        }
        return jsonify({"status": "success", "features": schema, "count": len(schema)})

    # ── /careers ───────────────────────────────────────────────────
    @app.route("/careers", methods=["GET"])
    def career_catalogue():
        catalogue = []
        for career_name, info in CAREER_NARRATIVES.items():
            catalogue.append({
                "name":        career_name,
                "description": info["description"],
                "key_traits":  info["key_traits"],
                "growth":      info["growth"],
                "salary_usd":  {"min": info["salary_usd"][0], "max": info["salary_usd"][1]},
            })
        return jsonify({"status": "success", "careers": catalogue, "count": len(catalogue)})

    # ── /metrics ───────────────────────────────────────────────────
    @app.route("/metrics", methods=["GET"])
    def model_metrics():
        metrics_path = Path(__file__).parent.parent / "models" / "artefacts" / "metrics.json"
        if not metrics_path.exists():
            return _error(503, "Model metrics not available. Run training first.")
        metrics = json.loads(metrics_path.read_text())
        return jsonify({"status": "success", "metrics": metrics})

    # ── /predict ───────────────────────────────────────────────────
    @app.route("/predict", methods=["POST"])
    @require_internal_token
    def predict():
        predictor, err = _get_predictor()
        if predictor is None:
            return _error(503, "Model is warming up, please retry in a few seconds",
                          {"detail": err or "warming_up"})

        body = request.get_json(silent=True)
        if not body:
            return _error(400, "Request body must be JSON with Content-Type: application/json")

        input_data = body.get("scores", body)
        top_n      = min(int(body.get("top_n", 3)), 10)

        try:
            # compute_drivers=False: skip the 40×N predict_proba permutation
            # loop — reduces latency from ~8 s → ~0.3 s for basic predict.
            result = predictor.predict(input_data, top_n=top_n, compute_drivers=False)
        except ValueError as e:
            return _error(422, "Input validation failed", {"error": str(e)})
        except Exception as e:
            logger.error("Prediction failed: %s", e)
            return _error(500, "Prediction failed", {"error": str(e)})

        result_dict = predictor.to_json(result)

        return jsonify({
            "status"      : "success",
            "top_careers" : _format_careers(result_dict["top_careers"], include_roles=True),
            "confidence"  : result_dict["confidence_summary"],
            "input"       : result_dict["input_features"],
            "model_info"  : {
                "version"   : result.model_version,
                "n_classes" : result.n_classes,
                "ensemble"  : "Random Forest (45%) + XGBoost (55%)",
            },
        })

    # ── /predict/batch ─────────────────────────────────────────────
    @app.route("/predict/batch", methods=["POST"])
    @require_internal_token
    def predict_batch():
        predictor, err = _get_predictor()
        if predictor is None:
            return _error(503, "Model is warming up, please retry in a few seconds",
                          {"detail": err or "warming_up"})

        body = request.get_json(silent=True)
        if not body or "records" not in body:
            return _error(400, "Expected JSON with 'records' array")

        records = body["records"]
        if not isinstance(records, list):
            return _error(400, "'records' must be an array")
        if len(records) > 50:
            return _error(400, "Batch size limit is 50 records per request")

        top_n   = min(int(body.get("top_n", 3)), 5)
        results = []
        errors  = []

        for idx, record in enumerate(records):
            try:
                result = predictor.predict(record, top_n=top_n, compute_drivers=False)
                r_dict = predictor.to_json(result)
                results.append({
                    "index"       : idx,
                    "status"      : "success",
                    "top_careers" : _format_careers(r_dict["top_careers"]),
                    "confidence"  : r_dict["confidence_summary"],
                })
            except Exception as exc:
                errors.append({"index": idx, "error": str(exc)})

        return jsonify({
            "status"     : "success",
            "results"    : results,
            "errors"     : errors,
            "total"      : len(records),
            "successful" : len(results),
            "failed"     : len(errors),
        })

    # ── /predict/explain ───────────────────────────────────────────
    @app.route("/predict/explain", methods=["POST"])
    @require_internal_token
    def predict_explain():
        """Full prediction with per-feature permutation-sensitivity drivers."""
        predictor, err = _get_predictor()
        if predictor is None:
            return _error(503, "Model is warming up, please retry in a few seconds",
                          {"detail": err or "warming_up"})

        body       = request.get_json(silent=True)
        input_data = body.get("scores", body) if body else {}

        try:
            # compute_drivers=True: runs ~40 × top_n extra predict_proba calls.
            # Only used here — the basic /predict endpoint skips this.
            result = predictor.predict(input_data, top_n=3, compute_drivers=True)
        except ValueError as e:
            return _error(422, "Input validation failed", {"error": str(e)})
        except Exception as e:
            logger.error("Explain failed: %s", e)
            return _error(500, "Prediction failed", {"error": str(e)})

        r_dict = predictor.to_json(result)

        return jsonify({
            "status"              : "success",
            "top_careers"         : _format_careers(
                r_dict["top_careers"], include_drivers=True, include_roles=True
            ),
            "confidence"          : r_dict["confidence_summary"],
            "input"               : r_dict["input_features"],
            "engineered_features" : r_dict["engineered_features"],
            "model_info"          : {
                "version"   : result.model_version,
                "n_classes" : result.n_classes,
                "ensemble"  : "Random Forest (45%) + XGBoost (55%)",
            },
        })

    # ── /example ───────────────────────────────────────────────────
    @app.route("/example", methods=["GET"])
    def example():
        return jsonify({
            "description": "Example prediction request body",
            "endpoint"   : "POST /predict",
            "body": {
                "math_score": 85, "science_score": 78, "english_score": 70,
                "communication": 65, "leadership": 60, "creativity": 72,
                "analytical_thinking": 88, "extroversion": 45,
                "conscientiousness": 80, "extracurricular": 55,
                "coding_interest": 75, "biology_interest": 20,
                "business_interest": 45, "design_interest": 40,
                "teaching_interest": 35, "research_interest": 70,
                "people_helping_interest": 40, "entrepreneurship_interest": 50,
                "top_n": 3,
            },
        })

    return app


# ── Helpers ────────────────────────────────────────────────────────
def _format_careers(
    careers: list,
    include_drivers: bool = False,
    include_roles:   bool = False,
) -> list:
    out = []
    for c in careers:
        entry = {
            "rank":            c["rank"],
            "career":          c["career"],
            "confidence_pct":  c["confidence_pct"],
            "confidence_tier": c["confidence_tier"],
            "rf_confidence":   c.get("rf_confidence"),
            "xgb_confidence":  c.get("xgb_confidence"),
            "model_agreement": c["model_agreement"],
            "description":     c["description"],
            "key_traits":      c["key_traits"],
            "growth_outlook":  c["growth_outlook"],
            "salary_range":    c["salary_range_usd"],
        }
        if include_roles:
            entry["recommended_roles"] = c.get("recommended_roles", [])
        if include_drivers:
            entry["top_drivers"] = c.get("top_drivers", [])
        out.append(entry)
    return out


def _feat_description(feat: str) -> str:
    descs = {
        "math_score":               "Proficiency in mathematics (algebra, calculus, statistics)",
        "science_score":            "Understanding of natural sciences (physics, chemistry, biology)",
        "english_score":            "Language proficiency, reading comprehension, and writing ability",
        "communication":            "Ability to express ideas clearly in verbal and written form",
        "leadership":               "Capacity to lead, motivate, and guide others",
        "creativity":               "Originality, innovation, and creative problem-solving",
        "analytical_thinking":      "Logical reasoning, pattern recognition, and critical analysis",
        "extroversion":             "Preference for social interaction and external stimulation",
        "conscientiousness":        "Organisation, diligence, reliability, and self-discipline",
        "extracurricular":          "Engagement in activities outside formal academics",
        "coding_interest":          "Interest and enthusiasm for programming and software development",
        "biology_interest":         "Interest in biological sciences and life sciences",
        "business_interest":        "Interest in business, commerce, and entrepreneurship",
        "design_interest":          "Interest in visual design, UX, and creative aesthetics",
        "teaching_interest":        "Interest in educating and mentoring others",
        "research_interest":        "Drive to investigate, explore, and generate new knowledge",
        "people_helping_interest":  "Motivation to support and improve others' wellbeing",
        "entrepreneurship_interest": "Drive to create ventures and take calculated business risks",
    }
    return descs.get(feat, feat.replace("_", " ").title())


if __name__ == "__main__":
    app  = create_app()
    port = int(os.getenv("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, debug=False)
