"""
Career Prediction Engine
=========================
Loads trained artefacts and produces:
  - Top-N career recommendations with confidence scores
  - Per-career explanations (feature contributions)
  - Uncertainty / confidence tier
  - Model agreement metrics

Thread-safe singleton pattern: models are loaded once at startup.
"""

import json
import warnings
from pathlib import Path
from functools import lru_cache
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np
import pandas as pd
import joblib
import sys

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
MODEL_DIR = ROOT / "models" / "artefacts"

# ── Input feature order ────────────────────────────────────────────
RAW_FEATURES = [
    "math_score",
    "science_score",
    "english_score",
    "communication",
    "leadership",
    "creativity",
    "analytical_thinking",
    "extroversion",
    "conscientiousness",
    "extracurricular",
    "coding_interest",
    "biology_interest",
    "business_interest",
    "design_interest",
    "teaching_interest",
    "research_interest",
    "people_helping_interest",
    "entrepreneurship_interest",
]

# ── Career narrative explanations ─────────────────────────────────
CAREER_NARRATIVES = {
    "Software Engineer": {
        "description": "Build software systems, applications, and infrastructure. Strong match for high analytical thinkers with solid math skills.",
        "key_traits":  ["Analytical thinking", "Math proficiency", "Logical reasoning", "Conscientiousness"],
        "growth":      "high_growth",
        "salary_usd":  (85_000, 180_000),
    },
    \
    "Data Scientist": {
        "description": "Extract insights from complex datasets using statistics and machine learning. Ideal for math-science students who love patterns.",
        "key_traits":  ["Math mastery", "Analytical thinking", "Science foundation", "Curiosity"],
        "growth":      "high_growth",
        "salary_usd":  (90_000, 170_000),
    },
    "Biomedical Researcher": {
        "description": "Advance human health through laboratory research and discovery. Perfect for high-science students driven by scientific curiosity.",
        "key_traits":  ["Science excellence", "Conscientiousness", "Analytical depth", "Patience"],
        "growth":      "growing",
        "salary_usd":  (65_000, 130_000),
    },
    "Civil Engineer": {
        "description": "Design and build infrastructure — bridges, roads, and cities. Combines strong math with spatial and analytical skills.",
        "key_traits":  ["Math aptitude", "Analytical thinking", "Science knowledge", "Detail orientation"],
        "growth":      "stable",
        "salary_usd":  (70_000, 140_000),
    },
    "Business Analyst": {
        "description": "Bridge business needs and technical solutions through data analysis and process improvement.",
        "key_traits":  ["Analytical thinking", "Communication", "Math skills", "Leadership"],
        "growth":      "growing",
        "salary_usd":  (65_000, 125_000),
    },
    "Entrepreneur": {
        "description": "Launch and grow ventures by spotting opportunities and taking calculated risks. For natural leaders with high creativity.",
        "key_traits":  ["Leadership", "Creativity", "Communication", "Extroversion", "Resilience"],
        "growth":      "variable",
        "salary_usd":  (50_000, 500_000),
    },
    "Marketing Manager": {
        "description": "Shape how products reach and resonate with audiences. Combines creativity with strategic communication.",
        "key_traits":  ["Communication", "Creativity", "Leadership", "Extroversion"],
        "growth":      "growing",
        "salary_usd":  (60_000, 140_000),
    },
    "Graphic Designer": {
        "description": "Communicate ideas visually through art, typography, and digital media. Exceptional creativity is the defining trait.",
        "key_traits":  ["Creativity", "Visual thinking", "Communication", "Extracurricular activities"],
        "growth":      "stable",
        "salary_usd":  (45_000, 95_000),
    },
    "Content Writer": {
        "description": "Craft compelling written content across industries. Top performers combine language mastery with creative storytelling.",
        "key_traits":  ["English proficiency", "Creativity", "Communication", "Conscientiousness"],
        "growth":      "stable",
        "salary_usd":  (40_000, 90_000),
    },
    "Architect": {
        "description": "Design buildings and spaces that balance aesthetics, function, and engineering. A rare fusion of art and science.",
        "key_traits":  ["Creativity", "Math aptitude", "Analytical thinking", "Conscientiousness"],
        "growth":      "stable",
        "salary_usd":  (65_000, 130_000),
    },
    "Medical Doctor": {
        "description": "Diagnose and treat illness, improving patient outcomes through science and human connection.",
        "key_traits":  ["Science excellence", "Conscientiousness", "Analytical thinking", "Communication"],
        "growth":      "growing",
        "salary_usd":  (150_000, 350_000),
    },
    "Psychologist": {
        "description": "Understand and support human mental health and behaviour through research and clinical practice.",
        "key_traits":  ["Communication", "Conscientiousness", "Analytical thinking", "Empathy"],
        "growth":      "growing",
        "salary_usd":  (60_000, 120_000),
    },
    "Teacher / Educator": {
        "description": "Inspire the next generation by communicating knowledge with passion, clarity, and creativity.",
        "key_traits":  ["Communication", "Leadership", "Creativity", "Conscientiousness"],
        "growth":      "stable",
        "salary_usd":  (45_000, 85_000),
    },
}
# ── Career Subfields ───────────────────────────────────────────────
CAREER_SUBFIELDS = {

    "Software Engineer": {
        "Backend Developer": ["coding_interest", "analytical_thinking"],
        "Frontend Developer": ["coding_interest", "creativity", "communication"],
        "Full Stack Developer": ["coding_interest", "analytical_thinking", "communication"],
        "Cloud Engineer": ["coding_interest", "analytical_thinking", "conscientiousness"],
        "DevOps Engineer": ["coding_interest", "analytical_thinking", "conscientiousness"]
    },

    "Data Scientist": {
        "Machine Learning Engineer": ["coding_interest", "research_interest", "analytical_thinking"],
        "Data Analyst": ["analytical_thinking", "math_score", "communication"],
        "AI Engineer": ["coding_interest", "research_interest", "science_score"],
        "Data Engineer": ["coding_interest", "analytical_thinking", "conscientiousness"],
        "Business Intelligence Analyst": ["business_interest", "analytical_thinking", "communication"]
    },

    "Biomedical Researcher": {
        "Genetics Researcher": ["biology_interest", "research_interest", "science_score"],
        "Microbiologist": ["biology_interest", "science_score", "analytical_thinking"],
        "Clinical Research Associate": ["research_interest", "communication", "science_score"],
        "Biotechnology Researcher": ["biology_interest", "research_interest", "analytical_thinking"],
        "Biomedical Scientist": ["biology_interest", "science_score", "research_interest"]
    },

    "Civil Engineer": {
        "Structural Engineer": ["math_score", "analytical_thinking", "science_score"],
        "Transportation Engineer": ["math_score", "leadership", "analytical_thinking"],
        "Construction Manager": ["leadership", "communication", "conscientiousness"],
        "Environmental Engineer": ["science_score", "research_interest", "analytical_thinking"],
        "Geotechnical Engineer": ["math_score", "science_score", "analytical_thinking"]
    },

    "Business Analyst": {
        "Product Analyst": ["business_interest", "analytical_thinking", "communication"],
        "Operations Analyst": ["business_interest", "analytical_thinking", "conscientiousness"],
        "Strategy Consultant": ["business_interest", "leadership", "communication"],
        "Market Research Analyst": ["business_interest", "research_interest", "communication"],
        "Business Analyst": ["business_interest", "analytical_thinking", "communication"]
    },

    "Entrepreneur": {
        "Startup Founder": ["entrepreneurship_interest", "leadership", "communication"],
        "Tech Entrepreneur": ["entrepreneurship_interest", "coding_interest", "leadership"],
        "E-commerce Entrepreneur": ["entrepreneurship_interest", "business_interest", "communication"],
        "Business Owner": ["entrepreneurship_interest", "leadership", "conscientiousness"],
        "Social Entrepreneur": ["entrepreneurship_interest", "people_helping_interest", "leadership"]
    },

    "Marketing Manager": {
        "Digital Marketing Manager": ["communication", "creativity", "business_interest"],
        "Brand Manager": ["leadership", "communication", "creativity"],
        "SEO Specialist": ["analytical_thinking", "communication", "business_interest"],
        "Content Marketing Manager": ["communication", "creativity", "english_score"],
        "Social Media Strategist": ["communication", "creativity", "extroversion"]
    },

    "Graphic Designer": {
        "UI/UX Designer": ["design_interest", "creativity", "communication"],
        "Motion Designer": ["design_interest", "creativity", "analytical_thinking"],
        "Brand Designer": ["design_interest", "communication", "creativity"],
        "Illustrator": ["design_interest", "creativity", "english_score"],
        "Game Artist": ["design_interest", "creativity", "coding_interest"]
    },

    "Content Writer": {
        "Technical Writer": ["english_score", "communication", "coding_interest"],
        "Copywriter": ["english_score", "creativity", "communication"],
        "Editor": ["english_score", "conscientiousness", "communication"],
        "Journalist": ["english_score", "communication", "research_interest"],
        "Content Writer": ["english_score", "creativity", "communication"]
    },

    "Architect": {
        "Interior Designer": ["design_interest", "creativity", "communication"],
        "Urban Planner": ["analytical_thinking", "leadership", "design_interest"],
        "Landscape Architect": ["design_interest", "creativity", "science_score"],
        "Sustainable Design Consultant": ["design_interest", "research_interest", "science_score"],
        "Architect": ["design_interest", "math_score", "creativity"]
    },

    "Medical Doctor": {
        "Cardiologist": ["biology_interest", "science_score", "research_interest"],
        "Neurologist": ["biology_interest", "research_interest", "analytical_thinking"],
        "Pediatrician": ["people_helping_interest", "communication", "biology_interest"],
        "Orthopedic Surgeon": ["biology_interest", "science_score", "conscientiousness"],
        "General Physician": ["biology_interest", "science_score", "communication"]
    },

    "Psychologist": {
        "Clinical Psychologist": ["people_helping_interest", "communication", "conscientiousness"],
        "Counseling Psychologist": ["people_helping_interest", "communication"],
        "School Psychologist": ["people_helping_interest", "teaching_interest", "communication"],
        "Behavioral Therapist": ["people_helping_interest", "communication", "analytical_thinking"],
        "Industrial Psychologist": ["communication", "leadership", "analytical_thinking"]
    },

    "Teacher / Educator": {
        "Professor": ["teaching_interest", "research_interest", "communication"],
        "Lecturer": ["teaching_interest", "communication", "leadership"],
        "Academic Counselor": ["people_helping_interest", "communication", "leadership"],
        "School Teacher": ["teaching_interest", "communication", "people_helping_interest"],
        "Curriculum Designer": ["teaching_interest", "creativity", "communication"]
    }
}


# ── Data classes ───────────────────────────────────────────────────
@dataclass
class CareerMatch:
    rank:             int
    career:           str
    confidence:       float
    confidence_pct:   float
    confidence_tier:  str
    rf_confidence:    float
    xgb_confidence:   float
    model_agreement:  float
    description:      str
    key_traits:       list[str]
    growth_outlook:   str
    salary_range_usd: tuple[int, int]
    top_drivers:      list[dict]
    recommended_roles: list[str] = field(default_factory=list)


@dataclass
class PredictionResult:
    top_careers:          list[CareerMatch]
    input_features:       dict
    engineered_features:  dict
    confidence_summary:   dict
    model_version:        str = "1.0.0"
    n_classes:            int = 13


def get_dynamic_roles(career: str, profile: dict, top_n: int = 3):

    role_map = CAREER_SUBFIELDS.get(career, {})

    if not role_map:
        return []

    role_scores = {}

    for role, features in role_map.items():

        vals = []

        for feat in features:
            if feat in profile:
                vals.append(profile[feat])

        if vals:
            role_scores[role] = sum(vals) / len(vals)

    ranked = sorted(
        role_scores.items(),
        key=lambda x: x[1],
        reverse=True
    )

    return [role for role, _ in ranked[:top_n]]


# ── Predictor class ────────────────────────────────────────────────
class CareerPredictor:
    """
    Thread-safe career prediction engine.
    Call load() once, then predict() as many times as needed.
    """

    _instance: Optional["CareerPredictor"] = None

    def __init__(self):
        self._loaded  = False
        self._fe      = None
        self._le      = None
        self._rf      = None
        self._xgb     = None
        self._classes = []
        self._feat_names = []

    # ── Singleton ──────────────────────────────────────────────────
    @classmethod
    def get_instance(cls) -> "CareerPredictor":
        if cls._instance is None:
            cls._instance = cls()
            cls._instance.load()
        return cls._instance

    # ── Load artefacts ─────────────────────────────────────────────
    def load(self) -> None:
        if self._loaded:
            return

        if not MODEL_DIR.exists():
            raise FileNotFoundError(
                f"Model artefacts not found at {MODEL_DIR}. "
                "Run `python models/train.py` first."
            )

        self._fe      = joblib.load(MODEL_DIR / "feature_engineer.joblib")
        self._le      = joblib.load(MODEL_DIR / "label_encoder.joblib")
        self._rf      = joblib.load(MODEL_DIR / "random_forest.joblib")
        self._xgb     = joblib.load(MODEL_DIR / "xgboost.joblib")
        self._classes = json.loads((MODEL_DIR / "class_names.json").read_text())
        self._feat_names = json.loads((MODEL_DIR / "feature_names.json").read_text())
        self._loaded  = True

    # ── Validation ─────────────────────────────────────────────────
    @staticmethod
    def validate_input(data: dict) -> dict:
        """Validate and coerce input; raise ValueError on bad input."""
        cleaned = {}
        for feat in RAW_FEATURES:
            if feat not in data:
                raise ValueError(f"Missing required feature: '{feat}'")
            try:
                val = float(data[feat])
            except (TypeError, ValueError):
                raise ValueError(f"Feature '{feat}' must be numeric, got {data[feat]!r}")
            if not (0.0 <= val <= 100.0):
                raise ValueError(f"Feature '{feat}' must be in [0, 100], got {val}")
            cleaned[feat] = round(val, 1)
        return cleaned

    # ── Confidence tier ────────────────────────────────────────────
    @staticmethod
    def _confidence_tier(prob: float) -> str:
        if prob >= 0.75:  return "Very High"
        if prob >= 0.55:  return "High"
        if prob >= 0.35:  return "Moderate"
        return "Low"

    # ── Feature driver explanation ─────────────────────────────────
    def _feature_drivers(
        self, X_eng_row: np.ndarray, career_idx: int, top_n: int = 5
    ) -> list[dict]:
        """
        Approximate feature contributions via permutation-style sensitivity.
        Returns top_n features most responsible for this career's probability.
        """
        rf_proba  = self._rf.predict_proba(X_eng_row)[0, career_idx]
        drivers   = []
        X_perturb = X_eng_row.copy()

        for i, fname in enumerate(self._feat_names):
            orig_val         = X_eng_row[0, i]
            X_perturb[0, i]  = 0.0                         # zero out
            p_rf_perturb     = self._rf.predict_proba(X_perturb)[0, career_idx]
            X_perturb[0, i]  = orig_val                    # restore

            impact = rf_proba - p_rf_perturb               # positive → helps
            drivers.append({
                "feature":    fname,
                "impact":     round(float(impact), 4),
                "direction":  "positive" if impact >= 0 else "negative",
            })

        drivers.sort(key=lambda d: abs(d["impact"]), reverse=True)
        return drivers[:top_n]

    # ── Core predict ──────────────────────────────────────────────
    def predict(self, raw_input: dict, top_n: int = 3) -> PredictionResult:
        """
        Generate top-N career recommendations.

        Parameters
        ----------
        raw_input : dict with keys matching RAW_FEATURES
        top_n     : number of careers to return (default 3)

        Returns
        -------
        PredictionResult dataclass
        """
        if not self._loaded:
            self.load()

        # Validate
        validated = self.validate_input(raw_input)

        # Build DataFrame for feature engineering
        row_df  = pd.DataFrame([validated])
        X_eng   = self._fe.transform(row_df)          # shape (1, n_feats)

        # Model probabilities
        rf_proba  = self._rf.predict_proba(X_eng)[0]   # shape (n_classes,)
        xgb_proba = self._xgb.predict_proba(X_eng)[0]
        ens_proba = 0.45 * rf_proba + 0.55 * xgb_proba

        # Rank by ensemble probability (descending)
        ranked_idx = np.argsort(ens_proba)[::-1]

        # Build CareerMatch objects for top_n
        matches = []
        for rank, idx in enumerate(ranked_idx[:top_n], start=1):
            career_name = self._classes[idx]
            conf        = float(ens_proba[idx])
            rf_conf     = float(rf_proba[idx])
            xgb_conf    = float(xgb_proba[idx])
            agreement   = 1.0 - abs(rf_conf - xgb_conf) / max(rf_conf, xgb_conf, 1e-9)

            narr = CAREER_NARRATIVES.get(career_name, {
                "description": f"Career in {career_name}.",
                "key_traits":  [],
                "growth":      "stable",
                "salary_usd":  (50_000, 120_000),
            })

            drivers = self._feature_drivers(X_eng, idx, top_n=5)

            recommended_roles = get_dynamic_roles(     career_name,     validated,     top_n=3 )

            matches.append(CareerMatch(
    rank             = rank,
    career           = career_name,
    confidence       = round(conf, 4),
    confidence_pct   = round(conf * 100, 1),
    confidence_tier  = self._confidence_tier(conf),
    rf_confidence    = round(rf_conf, 4),
    xgb_confidence   = round(xgb_conf, 4),
    model_agreement  = round(agreement, 4),
    description      = narr["description"],
    key_traits       = narr["key_traits"],
    growth_outlook   = narr["growth"],
    salary_range_usd = narr["salary_usd"],
    top_drivers      = drivers,
    recommended_roles = recommended_roles,
))

        # Confidence summary
        top_conf    = float(ens_proba[ranked_idx[0]])
        second_conf = float(ens_proba[ranked_idx[1]]) if len(ranked_idx) > 1 else 0.0
        summary = {
            "top_career_confidence": round(top_conf, 4),
            "confidence_gap":        round(top_conf - second_conf, 4),
            "prediction_certainty":  self._confidence_tier(top_conf),
            "rf_top_match":          self._classes[int(np.argmax(rf_proba))],
            "xgb_top_match":         self._classes[int(np.argmax(xgb_proba))],
            "models_agree":          np.argmax(rf_proba) == np.argmax(xgb_proba),
            "entropy":               round(float(-np.sum(ens_proba * np.log(ens_proba + 1e-9))), 4),
        }

        # Engineered features for transparency
        fe_dict = {
            name: round(float(val), 2)
            for name, val in zip(self._feat_names, X_eng[0])
        }

        return PredictionResult(
            top_careers          = matches,
            input_features       = validated,
            engineered_features  = fe_dict,
            confidence_summary   = summary,
            n_classes            = len(self._classes),
        )

    def to_json(self, result: PredictionResult) -> dict:
        """Serialise PredictionResult to a JSON-safe dict (all native Python types)."""
        import numpy as np
        def _coerce(obj):
            if isinstance(obj, dict):
                return {k: _coerce(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_coerce(i) for i in obj]
            if isinstance(obj, (np.bool_,)):
                return bool(obj)
            if isinstance(obj, (np.integer,)):
                return int(obj)
            if isinstance(obj, (np.floating,)):
                return float(obj)
            if isinstance(obj, tuple) and len(obj) == 2 and all(isinstance(x, int) for x in obj):
                return {"min": obj[0], "max": obj[1], "currency": "USD"}
            return obj
        d = asdict(result)
        return _coerce(d)


# ── Module-level convenience ───────────────────────────────────────
def get_predictor() -> CareerPredictor:
    return CareerPredictor.get_instance()


if __name__ == "__main__":
    # Quick smoke test
    sample = {
    "math_score": 85,
    "science_score": 80,
    "english_score": 80,
    "communication": 75,
    "leadership": 70,
    "creativity": 70,
    "analytical_thinking": 85,
    "extroversion": 65,
    "conscientiousness": 80,
    "extracurricular": 70,

    "coding_interest": 75,
    "biology_interest": 40,
    "business_interest": 65,
    "design_interest": 50,
    "teaching_interest": 50,
    "research_interest": 75,
    "people_helping_interest": 50,
    "entrepreneurship_interest": 65,
}
    

    print("Loading predictor…")
    predictor = get_predictor()
    result    = predictor.predict(sample, top_n=3)

    print(f"\nTop {len(result.top_careers)} Career Recommendations:")
    print("=" * 55)
    for m in result.top_careers:
        print(f"\n#{m.rank}  {m.career}")
        print(f"    Confidence : {m.confidence_pct:.1f}%  ({m.confidence_tier})")
        print(f"    RF / XGB   : {m.rf_confidence*100:.1f}% / {m.xgb_confidence*100:.1f}%")
        print(f"    Agreement  : {m.model_agreement*100:.1f}%")
        print(f"    Description: {m.description[:80]}…")
        print(f"    Key traits : {', '.join(m.key_traits[:3])}")
        print(f"    Salary     : ${m.salary_range_usd[0]:,}–${m.salary_range_usd[1]:,}")
        print(f"    Top driver : {m.top_drivers[0]['feature']} ({m.top_drivers[0]['direction']})")

        if m.recommended_roles:
             print("    Suggested Roles:")
             for role in m.recommended_roles:
                print(f"      • {role}")

    print(f"\nSummary: {result.confidence_summary}")
