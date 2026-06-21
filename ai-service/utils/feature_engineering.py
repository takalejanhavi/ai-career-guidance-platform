"""
Feature Engineering Pipeline
==============================
Transforms raw student scores into a richer feature space using
domain-informed composite features, interaction terms, and
statistical normalisation.

Design decisions:
  - All transformations are invertible / interpretable
  - No data leakage: transformations are fit on train, applied to test
  - Composite features named to carry human-readable meaning
  - Uses sklearn BaseEstimator so it slots into Pipeline directly
"""

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.preprocessing import StandardScaler


# ── Raw feature names ─────────────────────────────────────────────
RAW_FEATURES = [
    # Academic
    "math_score",
    "science_score",
    "english_score",

    # Personality
    "communication",
    "leadership",
    "creativity",
    "analytical_thinking",
    "extroversion",
    "conscientiousness",
    "extracurricular",

    # Interests
    "coding_interest",
    "biology_interest",
    "business_interest",
    "design_interest",
    "teaching_interest",
    "research_interest",
    "people_helping_interest",
    "entrepreneurship_interest",
]


class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Adds domain-specific composite features on top of the raw inputs.

    Composite features (all scaled 0–100 before combination):
      stem_aptitude         : weighted STEM academic average
      humanities_aptitude   : weighted language / social average
      leadership_potential  : leadership + extroversion + extracurricular
      creative_index        : creativity + extracurricular
      research_aptitude     : analytical + science + conscientiousness
      social_aptitude       : communication + extroversion + leadership
      work_ethic            : conscientiousness + extracurricular
      stem_vs_social_ratio  : STEM balance vs social orientation
      academic_overall      : unweighted mean of all three academic scores
      personality_profile   : mean of the five personality dimensions

    Interaction terms:
      math × analytical_thinking   (quantitative reasoning)
      creativity × communication   (creative communication)
      leadership × extroversion    (leadership expression)
      science × conscientiousness  (scientific rigour)
    """

    def __init__(self, scale: bool = True):
        self.scale  = scale
        self._scaler = StandardScaler()

    # ------------------------------------------------------------------
    def fit(self, X, y=None):
        df = self._to_df(X)
        X_eng = self._engineer(df)
        if self.scale:
            self._scaler.fit(X_eng)
        return self

    def transform(self, X, y=None):
        df    = self._to_df(X)
        X_eng = self._engineer(df)
        if self.scale:
            return self._scaler.transform(X_eng)
        return X_eng.values

    def get_feature_names_out(self):
        return np.array(self._feature_names)

    # ------------------------------------------------------------------
    def _to_df(self, X) -> pd.DataFrame:
        if isinstance(X, pd.DataFrame):
            return X[RAW_FEATURES].copy()
        return pd.DataFrame(X, columns=RAW_FEATURES)

    def _engineer(self, df: pd.DataFrame) -> pd.DataFrame:
        d = df.copy()

        # ── Composite academic ─────────────────────────────────────
        d["stem_aptitude"] = (
            0.45 * d["math_score"]
            + 0.40 * d["science_score"]
            + 0.15 * d["analytical_thinking"]
        )

        d["humanities_aptitude"] = (
            0.50 * d["english_score"]
            + 0.30 * d["communication"]
            + 0.20 * d["creativity"]
        )

        d["academic_overall"] = (
            d["math_score"] + d["science_score"] + d["english_score"]
        ) / 3.0

        # ── Composite personality ──────────────────────────────────
        d["leadership_potential"] = (
            0.45 * d["leadership"]
            + 0.30 * d["extroversion"]
            + 0.25 * d["extracurricular"]
        )

        d["creative_index"] = (
            0.65 * d["creativity"]
            + 0.35 * d["extracurricular"]
        )

        d["research_aptitude"] = (
            0.40 * d["analytical_thinking"]
            + 0.35 * d["science_score"]
            + 0.25 * d["conscientiousness"]
        )

        d["social_aptitude"] = (
            0.40 * d["communication"]
            + 0.35 * d["extroversion"]
            + 0.25 * d["leadership"]
        )

        d["work_ethic"] = (
            0.60 * d["conscientiousness"]
            + 0.40 * d["extracurricular"]
        )

        d["personality_profile"] = (
            d["leadership"]
            + d["creativity"]
            + d["extroversion"]
            + d["conscientiousness"]
            + d["communication"]
        ) / 5.0
        # Career orientation composites

        d["technical_orientation"] = (
    0.45 * d["coding_interest"]
    + 0.30 * d["analytical_thinking"]
    + 0.25 * d["math_score"]
)

        d["healthcare_orientation"] = (
    0.45 * d["biology_interest"]
    + 0.30 * d["science_score"]
    + 0.25 * d["people_helping_interest"]
)

        d["business_orientation"] = (
    0.45 * d["business_interest"]
    + 0.30 * d["leadership"]
    + 0.25 * d["communication"]
)

        d["creative_orientation"] = (
    0.50 * d["design_interest"]
    + 0.30 * d["creativity"]
    + 0.20 * d["english_score"]
)

        d["education_orientation"] = (
    0.50 * d["teaching_interest"]
    + 0.30 * d["people_helping_interest"]
    + 0.20 * d["communication"]
)

        d["research_orientation"] = (
    0.50 * d["research_interest"]
    + 0.30 * d["analytical_thinking"]
    + 0.20 * d["science_score"]
)
        # ── Balance ratio (-100..100, positive → STEM-leaning) ────
        d["stem_vs_social_ratio"] = d["stem_aptitude"] - d["social_aptitude"]

        # ── Interaction terms ──────────────────────────────────────
        # Normalise to 0-1 before multiplying to keep scale consistent
        d["interact_quant_reasoning"] = (
            (d["math_score"] / 100) * (d["analytical_thinking"] / 100) * 100
        )
        d["interact_creative_comm"] = (
            (d["creativity"] / 100) * (d["communication"] / 100) * 100
        )
        d["interact_leadership_expr"] = (
            (d["leadership"] / 100) * (d["extroversion"] / 100) * 100
        )
        d["interact_scientific_rigour"] = (
            (d["science_score"] / 100) * (d["conscientiousness"] / 100) * 100
        )
         
        d["interact_coding_analytical"] = (
            d["coding_interest"] * d["analytical_thinking"] / 100
)

        d["interact_biology_science"] = (
             d["biology_interest"] * d["science_score"] / 100
)

        d["interact_design_creativity"] = (
             d["design_interest"] * d["creativity"] / 100
)

        d["interact_business_leadership"] = (
            d["business_interest"] * d["leadership"] / 100
)

        d["interact_teaching_helping"] = (
            d["teaching_interest"] * d["people_helping_interest"] / 100
)

        # ── Score variance (student specialisation vs breadth) ────
        score_cols = ["math_score", "science_score", "english_score"]
        d["score_variance"] = d[score_cols].var(axis=1)

        # ── Personality extremity (distance from 50) ──────────────
        pers_cols = ["extroversion", "conscientiousness",
                     "leadership", "creativity", "communication"]
        d["personality_extremity"] = (d[pers_cols] - 50).abs().mean(axis=1)

        self._feature_names = list(d.columns)
        return d


# ── Stand-alone helper ─────────────────────────────────────────────
def get_feature_importance_labels() -> list[str]:
    """Return list of all engineered feature names (no scaler needed)."""
    dummy = pd.DataFrame(
        np.full((1, len(RAW_FEATURES)), 70.0), columns=RAW_FEATURES
    )
    fe = FeatureEngineer(scale=False)
    fe.fit(dummy)
    return list(fe._feature_names)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "..")
    from data.generate_dataset import generate_dataset

    df   = generate_dataset(n_total=500)
    feat = df[RAW_FEATURES]

    fe   = FeatureEngineer(scale=False)
    out  = fe.fit_transform(feat)
    names = fe.get_feature_names_out()

    print(f"\nEngineered feature count: {len(names)}")
    print("New composite features:")
    for n in names:
        if n not in RAW_FEATURES:
            print(f"  + {n}")
    print(f"\nOutput shape: {out.shape}")
