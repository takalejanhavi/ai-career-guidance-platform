"""
Test Suite — Career Prediction System
=======================================
Covers:
  - Dataset generation (shape, distributions, constraints)
  - Feature engineering (output shape, no NaN, scale)
  - Training pipeline (artefact creation, metric thresholds)
  - Prediction engine (validation, top-N, confidence)
  - Flask API (all endpoints, error cases, batch)

Run: pytest tests/test_all.py -v --tb=short
"""

import sys
import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path

# Root on path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data.generate_dataset import generate_dataset, FEATURES, LABEL_COL, CAREERS
from utils.feature_engineering import FeatureEngineer, RAW_FEATURES, get_feature_importance_labels


# ═══════════════════════════════════════════════════════════════════
# Dataset tests
# ═══════════════════════════════════════════════════════════════════

class TestDatasetGeneration:

    def test_shape(self):
        df = generate_dataset(n_total=500)
        assert len(df) >= 490          # +outliers ≈ +3%
        assert set(FEATURES).issubset(df.columns)
        assert LABEL_COL in df.columns

    def test_all_classes_present(self):
        df = generate_dataset(n_total=2000)
        expected = {c["label"] for c in CAREERS}
        assert expected == set(df[LABEL_COL].unique())

    def test_feature_range(self):
        df = generate_dataset(n_total=1000)
        for feat in FEATURES:
            assert df[feat].min() >= 0.0,  f"{feat} has values < 0"
            assert df[feat].max() <= 100.0, f"{feat} has values > 100"

    def test_no_nulls(self):
        df = generate_dataset(n_total=500)
        assert df[FEATURES].isnull().sum().sum() == 0

    def test_reproducible(self):
        # Dataset uses a module-level RNG; same n_total → same row count
        df1 = generate_dataset(n_total=300)
        df2 = generate_dataset(n_total=300)
        assert len(df1) == len(df2)
        assert set(df1.columns) == set(df2.columns)

    def test_class_weights_roughly_respected(self):
        df = generate_dataset(n_total=5000)
        dist = df[LABEL_COL].value_counts(normalize=True)
        # No single class dominates > 20%
        assert dist.max() < 0.20


# ═══════════════════════════════════════════════════════════════════
# Feature engineering tests
# ═══════════════════════════════════════════════════════════════════

class TestFeatureEngineering:

    @pytest.fixture(scope="class")
    def fitted_fe(self):
        df = generate_dataset(n_total=500)
        fe = FeatureEngineer(scale=True)
        fe.fit(df[RAW_FEATURES])
        return fe

    @pytest.fixture(scope="class")
    def sample_row(self):
        return pd.DataFrame([{
            "math_score": 80, "science_score": 75, "english_score": 70,
            "communication": 65, "leadership": 60, "creativity": 72,
            "analytical_thinking": 85, "extroversion": 50,
            "conscientiousness": 78, "extracurricular": 60,
        }])

    def test_output_shape_increases(self, fitted_fe, sample_row):
        out = fitted_fe.transform(sample_row)
        assert out.shape[1] > len(RAW_FEATURES)

    def test_no_nan_in_output(self, fitted_fe, sample_row):
        out = fitted_fe.transform(sample_row)
        assert not np.isnan(out).any()

    def test_feature_names_length_matches(self, fitted_fe, sample_row):
        out   = fitted_fe.transform(sample_row)
        names = fitted_fe.get_feature_names_out()
        assert out.shape[1] == len(names)

    def test_scale_applied(self, fitted_fe, sample_row):
        # With scale=True, output should have values typically in [-5, 5]
        out = fitted_fe.transform(sample_row)
        assert out.min() > -20 and out.max() < 20

    def test_unscaled_contains_raw_values(self):
        df = generate_dataset(n_total=100)
        fe = FeatureEngineer(scale=False)
        fe.fit(df[RAW_FEATURES])
        out = fe.transform(df[RAW_FEATURES])
        # Raw feature columns (first len(RAW_FEATURES) cols) are [0,100]
        raw_cols = out[:, :len(RAW_FEATURES)]
        assert raw_cols.min() >= 0.0
        assert raw_cols.max() <= 100.0

    def test_composite_feature_names_present(self):
        names = get_feature_importance_labels()
        expected_composites = [
            "stem_aptitude", "humanities_aptitude", "leadership_potential",
            "creative_index", "research_aptitude", "social_aptitude",
        ]
        for name in expected_composites:
            assert name in names, f"Missing composite: {name}"

    def test_interaction_terms_present(self):
        names = get_feature_importance_labels()
        assert "interact_quant_reasoning"  in names
        assert "interact_creative_comm"    in names
        assert "interact_leadership_expr"  in names


# ═══════════════════════════════════════════════════════════════════
# Training pipeline tests (run only if artefacts present)
# ═══════════════════════════════════════════════════════════════════

MODEL_DIR = Path(__file__).parent.parent / "models" / "artefacts"

@pytest.mark.skipif(not MODEL_DIR.exists(), reason="Artefacts not found — run training first")
class TestTrainingArtefacts:

    def test_all_artefacts_present(self):
        required = [
            "feature_engineer.joblib",
            "label_encoder.joblib",
            "random_forest.joblib",
            "xgboost.joblib",
            "class_names.json",
            "feature_names.json",
            "metrics.json",
        ]
        for fname in required:
            assert (MODEL_DIR / fname).exists(), f"Missing: {fname}"

    def test_class_names_json(self):
        classes = json.loads((MODEL_DIR / "class_names.json").read_text())
        assert isinstance(classes, list)
        assert len(classes) >= 10

    def test_metrics_thresholds(self):
        metrics = json.loads((MODEL_DIR / "metrics.json").read_text())
        ens_acc = metrics["ensemble"]["accuracy"]
        ens_f1  = metrics["ensemble"]["f1_weighted"]
        assert ens_acc >= 0.55, f"Ensemble accuracy too low: {ens_acc}"
        assert ens_f1  >= 0.55, f"Ensemble F1 too low: {ens_f1}"

    def test_feature_names_json(self):
        names = json.loads((MODEL_DIR / "feature_names.json").read_text())
        assert len(names) > len(RAW_FEATURES)
        for raw in RAW_FEATURES:
            assert raw in names


# ═══════════════════════════════════════════════════════════════════
# Predictor tests (require artefacts)
# ═══════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not MODEL_DIR.exists(), reason="Artefacts not found — run training first")
class TestPredictor:

    @pytest.fixture(scope="class")
    def predictor(self):
        from models.predict import CareerPredictor
        p = CareerPredictor()
        p.load()
        return p

    @pytest.fixture
    def good_input(self):
        return {
            "math_score": 88, "science_score": 82, "english_score": 70,
            "communication": 65, "leadership": 60, "creativity": 72,
            "analytical_thinking": 90, "extroversion": 45,
            "conscientiousness": 82, "extracurricular": 55,
        }

    def test_returns_top3(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=3)
        assert len(result.top_careers) == 3

    def test_ranks_sequential(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=3)
        ranks  = [c.rank for c in result.top_careers]
        assert ranks == [1, 2, 3]

    def test_confidence_descending(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=3)
        confs  = [c.confidence for c in result.top_careers]
        assert confs == sorted(confs, reverse=True)

    def test_confidence_sums_not_exceed_1(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=3)
        total  = sum(c.confidence for c in result.top_careers)
        assert total <= 1.001           # floating point tolerance

    def test_confidence_tier_assigned(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=3)
        valid  = {"Very High", "High", "Moderate", "Low"}
        for c in result.top_careers:
            assert c.confidence_tier in valid

    def test_top_drivers_present(self, predictor, good_input):
        result = predictor.predict(good_input, top_n=1)
        drivers = result.top_careers[0].top_drivers
        assert len(drivers) >= 1
        assert "feature" in drivers[0]
        assert "impact"   in drivers[0]
        assert "direction" in drivers[0]

    def test_validation_missing_feature(self, predictor):
        bad = {"math_score": 80}   # missing 9 features
        with pytest.raises(ValueError, match="Missing"):
            predictor.predict(bad)

    def test_validation_out_of_range(self, predictor, good_input):
        bad = {**good_input, "math_score": 150}
        with pytest.raises(ValueError, match="\\[0, 100\\]"):
            predictor.predict(bad)

    def test_validation_non_numeric(self, predictor, good_input):
        bad = {**good_input, "math_score": "excellent"}
        with pytest.raises(ValueError, match="numeric"):
            predictor.predict(bad)

    def test_model_agreement_in_result(self, predictor, good_input):
        result = predictor.predict(good_input)
        assert "models_agree" in result.confidence_summary
        assert "entropy"      in result.confidence_summary

    def test_to_json_serialisable(self, predictor, good_input):
        import json
        result = predictor.predict(good_input)
        d = predictor.to_json(result)
        # Should not raise
        serialised = json.dumps(d)
        assert len(serialised) > 100

    def test_different_profiles_different_top_career(self, predictor):
        stem_student = {
            "math_score": 95, "science_score": 90, "english_score": 60,
            "communication": 50, "leadership": 45, "creativity": 55,
            "analytical_thinking": 95, "extroversion": 35,
            "conscientiousness": 85, "extracurricular": 40,
        }
        creative_student = {
            "math_score": 50, "science_score": 48, "english_score": 88,
            "communication": 90, "leadership": 55, "creativity": 95,
            "analytical_thinking": 55, "extroversion": 75,
            "conscientiousness": 65, "extracurricular": 90,
        }
        r1 = predictor.predict(stem_student).top_careers[0].career
        r2 = predictor.predict(creative_student).top_careers[0].career
        assert r1 != r2, "Same top career for radically different students"


# ═══════════════════════════════════════════════════════════════════
# Flask API tests
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    from api.app import create_app
    app = create_app(testing=True)
    with app.test_client() as c:
        yield c


class TestAPIHealthAndSchema:

    def test_health_endpoint(self, client):
        r = client.get("/healthz")
        assert r.status_code in (200, 503)   # 503 if models not loaded
        data = r.get_json()
        assert "status" in data
        assert "ready"  in data

    def test_features_endpoint(self, client):
        r = client.get("/features")
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "success"
        assert data["count"] == len(RAW_FEATURES)
        for feat in RAW_FEATURES:
            assert feat in data["features"]

    def test_careers_endpoint(self, client):
        r = client.get("/careers")
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "success"
        assert data["count"] >= 10
        career = data["careers"][0]
        assert "name"        in career
        assert "description" in career
        assert "salary_usd"  in career

    def test_example_endpoint(self, client):
        r = client.get("/example")
        assert r.status_code == 200
        data = r.get_json()
        assert "body" in data
        assert "math_score" in data["body"]

    def test_404_handler(self, client):
        r = client.get("/nonexistent-route")
        assert r.status_code == 404
        assert r.get_json()["code"] == 404

    def test_response_time_header(self, client):
        r = client.get("/healthz")
        assert "X-Response-Time-Ms" in r.headers


@pytest.mark.skipif(not MODEL_DIR.exists(), reason="Artefacts not found — run training first")
class TestAPIPredictEndpoint:

    GOOD_BODY = {
        "math_score": 85, "science_score": 78, "english_score": 70,
        "communication": 65, "leadership": 60, "creativity": 72,
        "analytical_thinking": 88, "extroversion": 45,
        "conscientiousness": 80, "extracurricular": 55,
    }

    def test_predict_success(self, client):
        r = client.post("/predict", json=self.GOOD_BODY, headers={"Content-Type": "application/json"})
        assert r.status_code == 200
        data = r.get_json()
        assert data["status"] == "success"
        assert len(data["top_careers"]) == 3

    def test_predict_career_structure(self, client):
        r = client.post("/predict", json=self.GOOD_BODY)
        career = r.get_json()["top_careers"][0]
        for key in ["rank", "career", "confidence_pct", "confidence_tier", "description"]:
            assert key in career, f"Missing key: {key}"

    def test_predict_custom_top_n(self, client):
        body = {**self.GOOD_BODY, "top_n": 5}
        r    = client.post("/predict", json=body)
        assert r.status_code == 200
        assert len(r.get_json()["top_careers"]) == 5

    def test_predict_missing_feature_422(self, client):
        bad = {"math_score": 80}
        r   = client.post("/predict", json=bad)
        assert r.status_code == 422
        assert r.get_json()["code"] == 422

    def test_predict_out_of_range_422(self, client):
        bad = {**self.GOOD_BODY, "math_score": 110}
        r   = client.post("/predict", json=bad)
        assert r.status_code == 422

    def test_predict_no_body_400(self, client):
        r = client.post("/predict", data="not-json", content_type="text/plain")
        assert r.status_code == 400

    def test_predict_nested_scores(self, client):
        body = {"scores": self.GOOD_BODY, "top_n": 3}
        r    = client.post("/predict", json=body)
        assert r.status_code == 200

    def test_predict_explain(self, client):
        r = client.post("/predict/explain", json=self.GOOD_BODY)
        assert r.status_code == 200
        data = r.get_json()
        assert "engineered_features" in data
        career = data["top_careers"][0]
        assert "top_drivers" in career

    def test_batch_predict(self, client):
        body = {"records": [self.GOOD_BODY, self.GOOD_BODY, self.GOOD_BODY], "top_n": 2}
        r    = client.post("/predict/batch", json=body)
        assert r.status_code == 200
        data = r.get_json()
        assert data["total"]       == 3
        assert data["successful"]  == 3
        assert len(data["results"]) == 3

    def test_batch_too_large_400(self, client):
        records = [self.GOOD_BODY] * 51
        r = client.post("/predict/batch", json={"records": records})
        assert r.status_code == 400

    def test_batch_partial_errors(self, client):
        records = [self.GOOD_BODY, {"bad": "data"}]
        r = client.post("/predict/batch", json={"records": records})
        data = r.get_json()
        assert data["successful"] == 1
        assert data["failed"]     == 1
