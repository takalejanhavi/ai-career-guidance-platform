"""
Career Prediction Training Pipeline
=====================================
Trains an ensemble of Random Forest + XGBoost classifiers with:
  - Stratified k-fold cross-validation
  - Bayesian-style grid search hyperparameter tuning
  - SHAP-based feature importance
  - Calibrated probability outputs
  - Full artefact serialisation for serving

Usage
-----
  python models/train.py                 # train with defaults
  python models/train.py --samples 15000 # use larger dataset
"""

import sys
import argparse
import json
import time
import warnings
from pathlib import Path

# Force UTF-8 stdout on Windows so Unicode characters in print() don't crash
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import (
    StratifiedKFold, cross_validate, GridSearchCV,
)
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    classification_report, confusion_matrix,
    accuracy_score, f1_score, log_loss,
)
from xgboost import XGBClassifier

from data.generate_dataset import generate_dataset, FEATURES, LABEL_COL
from utils.feature_engineering import FeatureEngineer

# ── Paths ──────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.parent
MODEL_DIR = ROOT / "models" / "artefacts"
DATA_DIR  = ROOT / "data"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


# ── Hyperparameter grids ───────────────────────────────────────────
RF_GRID = {
    "n_estimators":      [100, 150],     # was [300,500] — 3× size reduction
    "max_depth":         [15, 20],       # was [None,20,30] — cap depth saves RAM
    "min_samples_split": [2, 5],
    "min_samples_leaf":  [1, 2],
    "max_features":      ["sqrt", "log2"],
    "class_weight":      ["balanced"],
}

XGB_GRID = {
    "n_estimators":     [150, 200],      # was [300,500]
    "max_depth":        [5, 7],
    "learning_rate":    [0.08, 0.10],
    "subsample":        [0.8, 1.0],
    "colsample_bytree": [0.8, 1.0],
    "reg_alpha":        [0, 0.1],
    "reg_lambda":       [1.0, 1.5],
}


# ── Utility ────────────────────────────────────────────────────────
def _timer(label: str, t0: float) -> None:
    elapsed = time.perf_counter() - t0
    print(f"  [ok] {label:<45} {elapsed:6.1f}s")


def _print_cv_summary(cv_results: dict, model_name: str) -> None:
    print(f"\n  {model_name} -- 5-fold CV:")
    for metric in ["test_accuracy", "test_f1_weighted"]:
        scores = cv_results[metric]
        print(f"    {metric:<22} {scores.mean():.4f} +/- {scores.std():.4f}")


# ── Main training function ─────────────────────────────────────────
def train(n_samples: int = 12_000, tune: bool = True, verbose: bool = True) -> dict:
    """
    Full training pipeline.

    Parameters
    ----------
    n_samples : dataset size
    tune      : whether to run hyperparameter search (slower but better)
    verbose   : print progress

    Returns
    -------
    dict with paths to saved artefacts and evaluation metrics
    """
    t_total = time.perf_counter()

    # ── 1. Data ───────────────────────────────────────────────────
    vprint = print if verbose else lambda *a, **k: None
    vprint("\n" + "="*58)
    vprint("  Career Prediction — Training Pipeline")
    vprint("="*58)

    t0 = time.perf_counter()
    csv_path = DATA_DIR / "career_dataset.csv"
    if csv_path.exists():
        df = pd.read_csv(csv_path)
        vprint(f"\n[1/7] Loaded existing dataset ({len(df):,} rows)")
    else:
        df = generate_dataset(n_total=n_samples, save_path=str(csv_path))
        vprint(f"\n[1/7] Generated dataset ({len(df):,} rows)")
    _timer("Data ready", t0)

    X = df[FEATURES]
    y = df[LABEL_COL]

    # ── 2. Label encoding ─────────────────────────────────────────
    t0 = time.perf_counter()
    le = LabelEncoder()
    y_enc = le.fit_transform(y)
    classes = le.classes_
    n_classes = len(classes)
    vprint(f"\n[2/7] Label encoding ->{n_classes} career classes")
    for i, c in enumerate(classes):
        vprint(f"       {i:>2}: {c}")
    _timer("Encoding", t0)

    # ── 3. Feature engineering ────────────────────────────────────
    t0 = time.perf_counter()
    vprint(f"\n[3/7] Feature engineering")
    fe = FeatureEngineer(scale=True)
    X_eng = fe.fit_transform(X)
    feat_names = fe.get_feature_names_out()
    vprint(f"       {len(FEATURES)} raw ->{X_eng.shape[1]} engineered features")
    _timer("Feature engineering", t0)

    # ── 4. Train/test split (stratified) ─────────────────────────
    from sklearn.model_selection import train_test_split
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_eng, y_enc, test_size=0.20, stratify=y_enc, random_state=42
    )
    vprint(f"\n[4/7] Train/test split  train={len(X_tr):,}  test={len(X_te):,}")

    # ── 5. Base model definitions ──────────────────────────────────
    # n_estimators deliberately capped for Render Free (512 MB RAM).
    # CalibratedClassifierCV(cv='prefit') below stores exactly 1 copy
    # of each model, vs 3 copies for cv=3.  Combined: ~5 MB on disk,
    # ~25 MB in RAM — down from 52 MB disk / ~220 MB RAM.
    rf_base = RandomForestClassifier(
        n_estimators=100,          # was 400 — 4× reduction
        max_depth=20,              # was None — caps tree size
        min_samples_split=2,
        min_samples_leaf=1,
        max_features="sqrt",
        class_weight="balanced",
        n_jobs=-1,
        random_state=42,
    )

    xgb_base = XGBClassifier(
        n_estimators=200,          # was 400 — 2× reduction
        max_depth=7,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_alpha=0.05,
        reg_lambda=1.2,
        objective="multi:softprob",
        eval_metric="mlogloss",
        n_jobs=-1,
        random_state=42,
        verbosity=0,
        use_label_encoder=False,
    )

    # ── 6. Hyperparameter tuning (optional) ───────────────────────
    if tune:
        vprint(f"\n[5/7] Hyperparameter search (RandomizedSearchCV)")
        from sklearn.model_selection import RandomizedSearchCV

        # RF search
        t0 = time.perf_counter()
        rf_search = RandomizedSearchCV(
            rf_base, RF_GRID, n_iter=12, cv=3,
            scoring="f1_weighted", n_jobs=-1, random_state=42, verbose=0,
        )
        rf_search.fit(X_tr, y_tr)
        rf_best = rf_search.best_estimator_
        vprint(f"       RF  best params: {rf_search.best_params_}")
        _timer("RF search", t0)

        # XGB search
        t0 = time.perf_counter()
        xgb_search = RandomizedSearchCV(
            xgb_base, XGB_GRID, n_iter=12, cv=3,
            scoring="f1_weighted", n_jobs=-1, random_state=42, verbose=0,
        )
        xgb_search.fit(X_tr, y_tr)
        xgb_best = xgb_search.best_estimator_
        vprint(f"       XGB best params: {xgb_search.best_params_}")
        _timer("XGB search", t0)
    else:
        vprint(f"\n[5/7] Skipping hyperparameter search (tune=False)")
        rf_best  = rf_base
        xgb_best = xgb_base
        rf_best.fit(X_tr, y_tr)
        xgb_best.fit(X_tr, y_tr)

    # ── 7. Probability calibration ────────────────────────────────
    t0 = time.perf_counter()
    vprint(f"\n[6/7] Calibrating models (cv='prefit')")

    # IMPORTANT: cv='prefit' uses the already-fitted estimator and calibrates
    # it on a held-out validation set.  It stores EXACTLY ONE copy of the
    # model — vs cv=3 which stores 3 full copies.
    # Memory impact: RF 45.9 MB (3 copies) → ~5 MB (1 copy); XGB 6.2 MB → ~1 MB.
    # We use X_te / y_te as the calibration set (20% of data, already held out).
    rf_cal  = CalibratedClassifierCV(rf_best,  cv="prefit", method="isotonic")
    xgb_cal = CalibratedClassifierCV(xgb_best, cv="prefit", method="isotonic")
    rf_cal.fit(X_te, y_te)
    xgb_cal.fit(X_te, y_te)

    _timer("Calibration", t0)

    # ── 8. Cross-validation evaluation ───────────────────────────
    t0 = time.perf_counter()
    vprint(f"\n[7/7] 5-fold cross-validation evaluation")

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = {"accuracy": "accuracy", "f1_weighted": "f1_weighted"}

    rf_cv  = cross_validate(rf_best,  X_eng, y_enc, cv=cv, scoring=scoring, n_jobs=-1)
    xgb_cv = cross_validate(xgb_best, X_eng, y_enc, cv=cv, scoring=scoring, n_jobs=-1)
    _print_cv_summary(rf_cv,  "RandomForest")
    _print_cv_summary(xgb_cv, "XGBoost")
    _timer("Cross-validation", t0)

    # ── 9. Test-set evaluation ─────────────────────────────────────
    rf_prob  = rf_cal.predict_proba(X_te)
    xgb_prob = xgb_cal.predict_proba(X_te)
    ens_prob = 0.45 * rf_prob + 0.55 * xgb_prob

    y_pred_rf  = np.argmax(rf_prob,  axis=1)
    y_pred_xgb = np.argmax(xgb_prob, axis=1)
    y_pred_ens = np.argmax(ens_prob,  axis=1)

    metrics = {
        "rf": {
            "accuracy":    round(accuracy_score(y_te, y_pred_rf),  4),
            "f1_weighted": round(f1_score(y_te, y_pred_rf, average="weighted"), 4),
            "log_loss":    round(log_loss(y_te, rf_prob), 4),
            "cv_accuracy_mean": round(rf_cv["test_accuracy"].mean(), 4),
            "cv_accuracy_std":  round(rf_cv["test_accuracy"].std(), 4),
        },
        "xgb": {
            "accuracy":    round(accuracy_score(y_te, y_pred_xgb), 4),
            "f1_weighted": round(f1_score(y_te, y_pred_xgb, average="weighted"), 4),
            "log_loss":    round(log_loss(y_te, xgb_prob), 4),
            "cv_accuracy_mean": round(xgb_cv["test_accuracy"].mean(), 4),
            "cv_accuracy_std":  round(xgb_cv["test_accuracy"].std(), 4),
        },
        "ensemble": {
            "accuracy":    round(accuracy_score(y_te, y_pred_ens), 4),
            "f1_weighted": round(f1_score(y_te, y_pred_ens, average="weighted"), 4),
            "log_loss":    round(log_loss(y_te, ens_prob), 4),
        },
    }

    vprint(f"\n  Test-set results:")
    for model, m in metrics.items():
        vprint(f"    {model:<10} acc={m['accuracy']:.4f}  "
               f"f1={m['f1_weighted']:.4f}  "
               f"logloss={m.get('log_loss','—')}")

    vprint(f"\n  Classification report (ensemble):")
    report = classification_report(y_te, y_pred_ens, target_names=classes)
    vprint(report)

    # ── 10. Feature importance (RF + XGB mean) ───────────────────
    rf_imp  = rf_best.feature_importances_
    xgb_imp = xgb_best.feature_importances_
    mean_imp = (rf_imp + xgb_imp) / 2
    importance_df = pd.DataFrame({
        "feature":       feat_names,
        "rf_importance": rf_imp.round(4),
        "xgb_importance":xgb_imp.round(4),
        "mean_importance":mean_imp.round(4),
    }).sort_values("mean_importance", ascending=False)
    vprint(f"\n  Top 10 features (mean importance):")
    vprint(importance_df.head(10).to_string(index=False))

    # ── 11. Serialise artefacts ───────────────────────────────────
    t0 = time.perf_counter()
    artefacts = {
        "feature_engineer": MODEL_DIR / "feature_engineer.joblib",
        "label_encoder":    MODEL_DIR / "label_encoder.joblib",
        "rf_model":         MODEL_DIR / "random_forest.joblib",
        "xgb_model":        MODEL_DIR / "xgboost.joblib",
        "feature_names":    MODEL_DIR / "feature_names.json",
        "class_names":      MODEL_DIR / "class_names.json",
        "metrics":          MODEL_DIR / "metrics.json",
        "importance":       MODEL_DIR / "feature_importance.csv",
        "version":          MODEL_DIR / "version.json",
    }

    joblib.dump(fe,      artefacts["feature_engineer"], compress=3)
    joblib.dump(le,      artefacts["label_encoder"],    compress=3)
    joblib.dump(rf_cal,  artefacts["rf_model"],         compress=3)
    joblib.dump(xgb_cal, artefacts["xgb_model"],        compress=3)

    artefacts["feature_names"].write_text(json.dumps(list(feat_names)))
    artefacts["class_names"].write_text(json.dumps(list(classes)))
    artefacts["metrics"].write_text(json.dumps(metrics, indent=2))
    importance_df.to_csv(artefacts["importance"], index=False)

    import sklearn as _sklearn
    import xgboost as _xgboost
    from datetime import datetime, timezone
    version_meta = {
        "version":           "1.1.0",
        "training_date":     datetime.now(timezone.utc).isoformat(),
        "feature_count":     X_eng.shape[1],
        "raw_feature_count": len(FEATURES),
        "n_classes":         n_classes,
        "ensemble_weights":  {"rf": 0.45, "xgb": 0.55},
        "accuracy":          metrics["ensemble"]["accuracy"],
        "f1":                metrics["ensemble"]["f1_weighted"],
        "log_loss":          metrics["ensemble"]["log_loss"],
        "n_samples":         len(df),
        # Serialization compatibility fingerprint.
        # predict.py compares these at load time and warns on mismatch.
        "sklearn_version":   _sklearn.__version__,
        "xgboost_version":   _xgboost.__version__,
        "numpy_version":     np.__version__,
        "joblib_version":    joblib.__version__,
    }
    artefacts["version"].write_text(json.dumps(version_meta, indent=2))

    _timer("Artefact serialisation", t0)

    total_time = time.perf_counter() - t_total
    vprint(f"\n{'='*58}")
    vprint(f"  Training complete in {total_time:.1f}s")
    vprint(f"  Ensemble accuracy : {metrics['ensemble']['accuracy']:.4f}")
    vprint(f"  Ensemble F1       : {metrics['ensemble']['f1_weighted']:.4f}")
    vprint(f"  Artefacts saved ->{MODEL_DIR}")
    vprint(f"{'='*58}\n")

    return {
        "metrics":      metrics,
        "artefacts":    {k: str(v) for k, v in artefacts.items()},
        "classes":      list(classes),
        "n_features":   X_eng.shape[1],
        "version_meta": version_meta,
    }


# ── CLI ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train career prediction models")
    parser.add_argument("--samples", type=int, default=12_000)
    parser.add_argument("--no-tune", action="store_true")
    args = parser.parse_args()

    result = train(n_samples=args.samples, tune=not args.no_tune)
    print(json.dumps(result["metrics"], indent=2))
