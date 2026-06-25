"""
Career Prediction Flask API
=============================
REST API exposing the career prediction engine with:
  - POST /predict         — main prediction endpoint
  - POST /predict/batch   — batch predictions
  - GET  /careers         — career catalogue
  - GET  /health          — liveness + readiness
  - GET  /metrics         — model performance metrics
  - GET  /features        — feature schema

Security: validates input strictly; all errors return structured JSON.
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

# ── Path setup ────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.predict import get_predictor, RAW_FEATURES, CAREER_NARRATIVES
from data.generate_dataset import CAREERS

# ── Logging ───────────────────────────────────────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("career_api")

# ── App factory ────────────────────────────────────────────────────
def create_app(testing: bool = False) -> Flask:
    app = Flask(__name__)
    app.config["TESTING"]    = testing
    app.config["JSON_SORT_KEYS"] = False

    # CORS — allow the frontend origin
    CORS(app, origins=os.getenv("ALLOWED_ORIGINS", "*").split(","))

    # ── Request timing ────────────────────────────────────────────
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

    # ── Error handlers ────────────────────────────────────────────
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

    # ── Auth guard (optional token) ───────────────────────────────
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

    # ── Load predictor eagerly ────────────────────────────────────
    predictor = None
    model_error = None
    try:
        logger.info("Loading predictor...")
        predictor = get_predictor()
        logger.info("Predictor loaded successfully")
    except Exception as exc:
        logger.exception("PREDICTOR LOAD FAILED")
        model_error = str(exc)

    # ── Health ────────────────────────────────────────────────────
    @app.route("/health", methods=["GET"])
    @app.route("/healthz", methods=["GET"])
    def health():
        ready = predictor is not None
        body  = {
            "status"   : "ok" if ready else "degraded",
            "ready"    : ready,
            "model"    : "loaded" if ready else f"unavailable: {model_error}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version"  : "1.0.0",
        }
        return jsonify(body), 200 if ready else 503

    # ── Feature schema ────────────────────────────────────────────
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

    # ── Career catalogue ──────────────────────────────────────────
    @app.route("/careers", methods=["GET"])
    def career_catalogue():
        catalogue = []
        for career_name, info in CAREER_NARRATIVES.items():
            entry = {
                "name":         career_name,
                "description":  info["description"],
                "key_traits":   info["key_traits"],
                "growth":       info["growth"],
                "salary_usd":   {"min": info["salary_usd"][0], "max": info["salary_usd"][1]},
            }
            catalogue.append(entry)
        return jsonify({"status": "success", "careers": catalogue, "count": len(catalogue)})

    # ── Model metrics ─────────────────────────────────────────────
    @app.route("/metrics", methods=["GET"])
    def model_metrics():
        metrics_path = Path(__file__).parent.parent / "models" / "artefacts" / "metrics.json"
        if not metrics_path.exists():
            return _error(503, "Model metrics not available. Run training first.")
        metrics = json.loads(metrics_path.read_text())
        return jsonify({"status": "success", "metrics": metrics})

    # ── /predict (single) ─────────────────────────────────────────
    @app.route("/predict", methods=["POST"])
    @require_internal_token
    def predict():
        if predictor is None:
            return _error(503, f"Model not loaded: {model_error}")

        body = request.get_json(silent=True)
        if not body:
            return _error(400, "Request body must be JSON with Content-Type: application/json")

        # Support nested or flat input
        input_data = body.get("scores", body)
        top_n      = min(int(body.get("top_n", 3)), 10)

        try:
            result = predictor.predict(input_data, top_n=top_n)
        except ValueError as e:
            return _error(422, "Input validation failed", {"error": str(e)})
        except Exception as e:
            logger.error("Prediction failed: %s", e)
            return _error(500, "Prediction failed", {"error": str(e)})

        result_dict = predictor.to_json(result)

        response_body = {
            "status"      : "success",
            "top_careers" : _format_careers(result_dict["top_careers"], include_roles=True),
            "confidence"  : result_dict["confidence_summary"],
            "input"       : result_dict["input_features"],
            "model_info"  : {
                "version"   : result.model_version,
                "n_classes" : result.n_classes,
                "ensemble"  : "Random Forest (45%) + XGBoost (55%)",
            },
        }
        return jsonify(response_body)

    # ── /predict/batch ────────────────────────────────────────────
    @app.route("/predict/batch", methods=["POST"])
    @require_internal_token
    def predict_batch():
        if predictor is None:
            return _error(503, f"Model not loaded: {model_error}")

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
                result = predictor.predict(record, top_n=top_n)
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

    # ── /predict/explain ──────────────────────────────────────────
    @app.route("/predict/explain", methods=["POST"])
    @require_internal_token
    def predict_explain():
        """Full prediction with detailed feature importance explanation."""
        if predictor is None:
            return _error(503, f"Model not loaded: {model_error}")

        body       = request.get_json(silent=True)
        input_data = body.get("scores", body) if body else {}

        try:
            result = predictor.predict(input_data, top_n=3)
        except ValueError as e:
            return _error(422, "Input validation failed", {"error": str(e)})
        except Exception as e:
            logger.error("Explain failed: %s", e)
            return _error(500, "Prediction failed", {"error": str(e)})

        r_dict = predictor.to_json(result)

        return jsonify({
            "status"              : "success",
            "top_careers"         : _format_careers(r_dict["top_careers"], include_drivers=True, include_roles=True),
            "confidence"          : r_dict["confidence_summary"],
            "input"               : r_dict["input_features"],
            "engineered_features" : r_dict["engineered_features"],
            "model_info"          : {
                "version"   : result.model_version,
                "n_classes" : result.n_classes,
                "ensemble"  : "Random Forest (45%) + XGBoost (55%)",
            },
        })

    # ── Example input endpoint ────────────────────────────────────
    @app.route("/example", methods=["GET"])
    def example():
        return jsonify({
            "description": "Example prediction request body",
            "endpoint"   : "POST /predict",
            "body": {
                "math_score":          85,
                "science_score":       78,
                "english_score":       70,
                "communication":       65,
                "leadership":          60,
                "creativity":          72,
                "analytical_thinking": 88,
                "extroversion":        45,
                "conscientiousness":   80,
                "extracurricular":     55,
                "top_n":               3,
            },
        })

    return app


# ── Helpers ────────────────────────────────────────────────────────
def _format_careers(careers: list, include_drivers: bool = False, include_roles: bool = False) -> list:
    out = []
    for c in careers:
        entry = {
            "rank":              c["rank"],
            "career":            c["career"],
            "confidence_pct":    c["confidence_pct"],
            "confidence_tier":   c["confidence_tier"],
            "rf_confidence":     c.get("rf_confidence"),
            "xgb_confidence":    c.get("xgb_confidence"),
            "model_agreement":   c["model_agreement"],
            "description":       c["description"],
            "key_traits":        c["key_traits"],
            "growth_outlook":    c["growth_outlook"],
            "salary_range":      c["salary_range_usd"],
            "recommended_roles": c.get("recommended_roles", []),
        }
        if include_drivers:
            entry["top_drivers"] = c.get("top_drivers", [])
        out.append(entry)
    return out


def _feat_description(feat: str) -> str:
    descs = {
        "math_score":          "Proficiency in mathematics (algebra, calculus, statistics)",
        "science_score":       "Understanding of natural sciences (physics, chemistry, biology)",
        "english_score":       "Language proficiency, reading comprehension, and writing ability",
        "communication":       "Ability to express ideas clearly in verbal and written form",
        "leadership":          "Capacity to lead, motivate, and guide others",
        "creativity":          "Originality, innovation, and creative problem-solving",
        "analytical_thinking": "Logical reasoning, pattern recognition, and critical analysis",
        "extroversion":        "Preference for social interaction and external stimulation",
        "conscientiousness":   "Organisation, diligence, reliability, and self-discipline",
        "extracurricular":     "Engagement in activities outside formal academics",
    }
    return descs.get(feat, feat.replace("_", " ").title())


# ── Entry point ────────────────────────────────────────────────────
if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", 5050))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logger.info("Starting Career Prediction API on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=debug)
