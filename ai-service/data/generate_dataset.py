"""
Career Guidance Dataset Generator
===================================
Generates a synthetic but statistically realistic dataset mapping
student aptitude/personality scores to career outcomes.

Design principles:
  - Each career has a distinct, defensible feature profile
  - Gaussian noise is added to avoid perfect separation
  - Class imbalance mirrors real-world career distributions
  - Outliers (~3%) simulate atypical students
"""

import numpy as np
import pandas as pd
from pathlib import Path

# ── Reproducibility ───────────────────────────────────────────────
RNG = np.random.default_rng(seed=42)

# ── Career definitions ────────────────────────────────────────────
# Each entry: (career_label, base_profile, population_weight)
# Profile keys match feature column names.
# Values are (mean, std) tuples for that career's typical student.

CAREERS = [
    # STEM careers
    {
    "label": "Software Engineer",
    "weight": 0.12,
    "profile": {
        "math_score": (85, 8),
        "science_score": (78, 9),
        "english_score": (68, 10),
        "communication": (62, 12),
        "leadership": (55, 13),
        "creativity": (70, 11),
        "analytical_thinking": (88, 7),
        "extroversion": (45, 15),
        "conscientiousness": (80, 10),
        "extracurricular": (55, 18),

        "coding_interest": (82, 10),
        "biology_interest": (20, 5),
        "business_interest": (45, 8),
        "design_interest": (40, 8),
        "teaching_interest": (35, 8),
        "research_interest": (70, 10),
        "people_helping_interest": (40, 8),
        "entrepreneurship_interest": (50, 8),
    },
},

{
    "label": "Data Scientist",
    "weight": 0.09,
    "profile": {
        "math_score": (88, 7),
        "science_score": (80, 8),
        "english_score": (72, 9),
        "communication": (68, 11),
        "leadership": (58, 12),
        "creativity": (72, 10),
        "analytical_thinking": (91, 6),
        "extroversion": (48, 14),
        "conscientiousness": (82, 9),
        "extracurricular": (50, 17),

        "coding_interest": (80, 10),
        "biology_interest": (35, 7),
        "business_interest": (65, 10),
        "design_interest": (35, 8),
        "teaching_interest": (40, 8),
        "research_interest": (85, 8),
        "people_helping_interest": (45, 8),
        "entrepreneurship_interest": (45, 8),
    },
},

{
    "label": "Biomedical Researcher",
    "weight": 0.07,
    "profile": {
        "math_score": (82, 8),
        "science_score": (90, 6),
        "english_score": (74, 9),
        "communication": (65, 11),
        "leadership": (57, 12),
        "creativity": (75, 10),
        "analytical_thinking": (86, 8),
        "extroversion": (47, 14),
        "conscientiousness": (85, 8),
        "extracurricular": (52, 16),

        "coding_interest": (40, 8),
        "biology_interest": (88, 8),
        "business_interest": (25, 8),
        "design_interest": (30, 8),
        "teaching_interest": (45, 8),
        "research_interest": (88, 8),
        "people_helping_interest": (75, 10),
        "entrepreneurship_interest": (25, 8),
    },
},

{
    "label": "Civil Engineer",
    "weight": 0.08,
    "profile": {
        "math_score": (84, 7),
        "science_score": (82, 8),
        "english_score": (66, 10),
        "communication": (65, 12),
        "leadership": (62, 12),
        "creativity": (65, 11),
        "analytical_thinking": (84, 8),
        "extroversion": (50, 15),
        "conscientiousness": (83, 9),
        "extracurricular": (58, 17),

        "coding_interest": (55, 8),
        "biology_interest": (25, 8),
        "business_interest": (55, 8),
        "design_interest": (75, 6),
        "teaching_interest": (30, 8),
        "research_interest": (65, 7),
        "people_helping_interest": (40, 8),
        "entrepreneurship_interest": (50, 8),
    },
},

{
    "label": "Business Analyst",
    "weight": 0.08,
    "profile": {
        "math_score": (75, 9),
        "science_score": (65, 10),
        "english_score": (78, 8),
        "communication": (80, 9),
        "leadership": (70, 11),
        "creativity": (68, 11),
        "analytical_thinking": (82, 8),
        "extroversion": (62, 14),
        "conscientiousness": (78, 10),
        "extracurricular": (65, 16),

        "coding_interest": (65, 10),
        "biology_interest": (25, 8),
        "business_interest": (82, 10),
        "design_interest": (35, 8),
        "teaching_interest": (45, 8),
        "research_interest": (70, 6),
        "people_helping_interest": (55, 7),
        "entrepreneurship_interest": (70, 6),
    },
},
   {
    "label": "Data Scientist",
    "weight": 0.09,
    "profile": {
        "math_score": (88, 7),
        "science_score": (80, 8),
        "english_score": (72, 9),
        "communication": (68, 11),
        "leadership": (58, 12),
        "creativity": (72, 10),
        "analytical_thinking": (91, 6),
        "extroversion": (48, 14),
        "conscientiousness": (82, 9),
        "extracurricular": (50, 17),

        "coding_interest": (80, 10),
        "biology_interest": (35, 7),
        "business_interest": (65, 10),
        "design_interest": (35, 8),
        "teaching_interest": (40, 8),
        "research_interest": (85, 8),
        "people_helping_interest": (45, 8),
        "entrepreneurship_interest": (45, 8),
    },
},

{
    "label": "Biomedical Researcher",
    "weight": 0.07,
    "profile": {
        "math_score": (82, 8),
        "science_score": (90, 6),
        "english_score": (74, 9),
        "communication": (65, 11),
        "leadership": (57, 12),
        "creativity": (75, 10),
        "analytical_thinking": (86, 8),
        "extroversion": (47, 14),
        "conscientiousness": (85, 8),
        "extracurricular": (52, 16),

        "coding_interest": (40, 8),
        "biology_interest": (88, 8),
        "business_interest": (25, 8),
        "design_interest": (30, 8),
        "teaching_interest": (45, 8),
        "research_interest": (88, 8),
        "people_helping_interest": (75, 10),
        "entrepreneurship_interest": (25, 8),
    },
},

{
    "label": "Civil Engineer",
    "weight": 0.08,
    "profile": {
        "math_score": (84, 7),
        "science_score": (82, 8),
        "english_score": (66, 10),
        "communication": (65, 12),
        "leadership": (62, 12),
        "creativity": (65, 11),
        "analytical_thinking": (84, 8),
        "extroversion": (50, 15),
        "conscientiousness": (83, 9),
        "extracurricular": (58, 17),

        "coding_interest": (55, 8),
        "biology_interest": (25, 8),
        "business_interest": (55, 8),
        "design_interest": (75, 6),
        "teaching_interest": (30, 8),
        "research_interest": (65, 7),
        "people_helping_interest": (40, 8),
        "entrepreneurship_interest": (50, 8),
    },
},

{
    "label": "Business Analyst",
    "weight": 0.08,
    "profile": {
        "math_score": (75, 9),
        "science_score": (65, 10),
        "english_score": (78, 8),
        "communication": (80, 9),
        "leadership": (70, 11),
        "creativity": (68, 11),
        "analytical_thinking": (82, 8),
        "extroversion": (62, 14),
        "conscientiousness": (78, 10),
        "extracurricular": (65, 16),

        "coding_interest": (65, 10),
        "biology_interest": (25, 8),
        "business_interest": (82, 10),
        "design_interest": (35, 8),
        "teaching_interest": (45, 8),
        "research_interest": (70, 6),
        "people_helping_interest": (55, 7),
        "entrepreneurship_interest": (70, 6),
    },
},
    {
    "label": "Entrepreneur",
    "weight": 0.06,
    "profile": {
        "math_score": (70, 12),
        "science_score": (62, 12),
        "english_score": (76, 10),
        "communication": (85, 8),
        "leadership": (85, 10),
        "creativity": (88, 7),
        "analytical_thinking": (75, 10),
        "extroversion": (82, 10),
        "conscientiousness": (72, 12),
        "extracurricular": (85, 12),

        "coding_interest": (50, 8),
        "biology_interest": (20, 8),
        "business_interest": (82, 10),
        "design_interest": (60, 7),
        "teaching_interest": (40, 8),
        "research_interest": (40, 8),
        "people_helping_interest": (60, 7),
        "entrepreneurship_interest": (85, 10),
    },
},

{
    "label": "Marketing Manager",
    "weight": 0.07,
    "profile": {
        "math_score": (65, 10),
        "science_score": (58, 11),
        "english_score": (82, 8),
        "communication": (88, 7),
        "leadership": (75, 10),
        "creativity": (85, 8),
        "analytical_thinking": (70, 11),
        "extroversion": (80, 10),
        "conscientiousness": (73, 11),
        "extracurricular": (78, 13),

        "coding_interest": (25, 8),
        "biology_interest": (20, 8),
        "business_interest": (80, 10),
        "design_interest": (75, 6),
        "teaching_interest": (40, 8),
        "research_interest": (35, 8),
        "people_helping_interest": (65, 6),
        "entrepreneurship_interest": (70, 10),
    },
},

{
    "label": "Graphic Designer",
    "weight": 0.06,
    "profile": {
        "math_score": (58, 12),
        "science_score": (55, 12),
        "english_score": (72, 10),
        "communication": (72, 11),
        "leadership": (52, 14),
        "creativity": (88, 8),
        "analytical_thinking": (62, 12),
        "extroversion": (60, 15),
        "conscientiousness": (70, 12),
        "extracurricular": (80, 13),

        "coding_interest": (25, 8),
        "biology_interest": (20, 8),
        "business_interest": (30, 8),
        "design_interest": (88, 8),
        "teaching_interest": (35, 8),
        "research_interest": (30, 8),
        "people_helping_interest": (40, 8),
        "entrepreneurship_interest": (55, 7),
    },
},

{
    "label": "Content Writer",
    "weight": 0.05,
    "profile": {
        "math_score": (55, 11),
        "science_score": (52, 12),
        "english_score": (90, 6),
        "communication": (82, 8),
        "leadership": (50, 14),
        "creativity": (88, 7),
        "analytical_thinking": (65, 12),
        "extroversion": (55, 16),
        "conscientiousness": (72, 11),
        "extracurricular": (70, 15),

        "coding_interest": (20, 8),
        "biology_interest": (25, 8),
        "business_interest": (45, 8),
        "design_interest": (60, 7),
        "teaching_interest": (55, 7),
        "research_interest": (60, 7),
        "people_helping_interest": (55, 7),
        "entrepreneurship_interest": (45, 8),
    },
},

{
    "label": "Architect",
    "weight": 0.05,
    "profile": {
        "math_score": (80, 8),
        "science_score": (72, 9),
        "english_score": (70, 10),
        "communication": (70, 11),
        "leadership": (63, 12),
        "creativity": (85, 8),
        "analytical_thinking": (80, 9),
        "extroversion": (55, 14),
        "conscientiousness": (80, 9),
        "extracurricular": (68, 15),

        "coding_interest": (45, 8),
        "biology_interest": (20, 8),
        "business_interest": (50, 8),
        "design_interest": (85, 8),
        "teaching_interest": (35, 8),
        "research_interest": (55, 7),
        "people_helping_interest": (35, 8),
        "entrepreneurship_interest": (60, 7),
    },
},

{
    "label": "Medical Doctor",
    "weight": 0.08,
    "profile": {
        "math_score": (86, 7),
        "science_score": (91, 5),
        "english_score": (75, 9),
        "communication": (78, 9),
        "leadership": (72, 10),
        "creativity": (65, 11),
        "analytical_thinking": (87, 7),
        "extroversion": (63, 13),
        "conscientiousness": (90, 6),
        "extracurricular": (62, 15),

        "coding_interest": (15, 8),
        "biology_interest": (90, 8),
        "business_interest": (25, 8),
        "design_interest": (20, 8),
        "teaching_interest": (45, 8),
        "research_interest": (80, 8),
        "people_helping_interest": (85, 8),
        "entrepreneurship_interest": (25, 8),
    },
},

{
    "label": "Psychologist",
    "weight": 0.06,
    "profile": {
        "math_score": (65, 10),
        "science_score": (70, 9),
        "english_score": (80, 8),
        "communication": (88, 7),
        "leadership": (65, 12),
        "creativity": (72, 10),
        "analytical_thinking": (78, 9),
        "extroversion": (68, 13),
        "conscientiousness": (85, 8),
        "extracurricular": (68, 14),

        "coding_interest": (20, 8),
        "biology_interest": (65, 6),
        "business_interest": (35, 8),
        "design_interest": (35, 8),
        "teaching_interest": (70, 10),
        "research_interest": (75, 8),
        "people_helping_interest": (88, 8),
        "entrepreneurship_interest": (30, 8),
    },
},

{
    "label": "Teacher / Educator",
    "weight": 0.07,
    "profile": {
        "math_score": (72, 10),
        "science_score": (68, 10),
        "english_score": (83, 7),
        "communication": (88, 7),
        "leadership": (78, 9),
        "creativity": (78, 9),
        "analytical_thinking": (72, 10),
        "extroversion": (73, 12),
        "conscientiousness": (83, 8),
        "extracurricular": (75, 13),

        "coding_interest": (20, 8),
        "biology_interest": (45, 8),
        "business_interest": (35, 8),
        "design_interest": (40, 8),
        "teaching_interest": (88, 8),
        "research_interest": (60, 10),
        "people_helping_interest": (80, 8),
        "entrepreneurship_interest": (25, 8),
    },
},
]

FEATURES = [
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

    # Career Interests
    "coding_interest",
    "biology_interest",
    "business_interest",
    "design_interest",
    "teaching_interest",
    "research_interest",
    "people_helping_interest",
    "entrepreneurship_interest",
]

LABEL_COL = "career"


def _generate_career_block(career: dict, n: int) -> pd.DataFrame:
    """Generate n samples for a single career using its profile."""
    rows = {}
    for feat in FEATURES:
        mean, std = career["profile"][feat]
        vals = RNG.normal(mean, std, size=n)
        rows[feat] = np.clip(vals, 0, 100)
    rows[LABEL_COL] = career["label"]
    return pd.DataFrame(rows)


def _add_outliers(df: pd.DataFrame, fraction: float = 0.03) -> pd.DataFrame:
    """Inject random noise rows to simulate atypical students."""
    n_out = int(len(df) * fraction)
    labels = df[LABEL_COL].sample(n_out, replace=True, random_state=99).values
    noise  = pd.DataFrame(
        RNG.uniform(30, 95, size=(n_out, len(FEATURES))),
        columns=FEATURES,
    )
    noise[LABEL_COL] = labels
    return pd.concat([df, noise], ignore_index=True)


def generate_dataset(n_total: int = 10_000, save_path: str | None = None) -> pd.DataFrame:
    """
    Generate a synthetic career-prediction dataset.

    Parameters
    ----------
    n_total   : total number of samples
    save_path : if provided, saves CSV to this path

    Returns
    -------
    pd.DataFrame with features + 'career' column
    """
    weights = np.array([c["weight"] for c in CAREERS])
    weights /= weights.sum()          # normalise to sum=1
    counts  = np.round(weights * n_total).astype(int)
    # adjust rounding error
    counts[-1] += n_total - counts.sum()

    blocks = [
        _generate_career_block(career, int(n))
        for career, n in zip(CAREERS, counts)
    ]
    df = pd.concat(blocks, ignore_index=True)
    #df = _add_outliers(df)
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)

    # Round feature scores to 1 decimal place
    df[FEATURES] = df[FEATURES].round(1)

    if save_path:
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(save_path, index=False)
        print(f"Dataset saved → {save_path}  ({len(df):,} rows)")

    return df


def dataset_summary(df: pd.DataFrame) -> None:
    """Print a quick summary of the generated dataset."""
    print(f"\n{'='*55}")
    print(f"  Dataset: {len(df):,} rows × {len(df.columns)} columns")
    print(f"{'='*55}")
    print("\nClass distribution:")
    dist = df[LABEL_COL].value_counts()
    for label, cnt in dist.items():
        bar = "█" * int(cnt / dist.max() * 30)
        print(f"  {label:<25} {cnt:>5}  {bar}")
    print(f"\nFeature statistics:\n{df[FEATURES].describe().round(1).to_string()}\n")


if __name__ == "__main__":
    df = generate_dataset(n_total=12_000, save_path="data/career_dataset.csv")
    dataset_summary(df)
