# ── Stage 1: install Python dependencies ──────────────────────────
#
# Uses requirements-prod.txt (no shap, no imbalanced-learn, no pytest).
# Savings vs full requirements: ~200 MB image size, ~60 MB runtime RAM.
#
FROM python:3.11-slim AS builder

WORKDIR /build

# GCC needed only for native extensions (numpy, xgboost) — not in final image.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements-prod.txt


# ── Stage 2: production runtime ───────────────────────────────────
#
# Artefacts (models/artefacts/*.joblib) are committed to the repo and
# copied here directly.  There is NO training step in Docker — training
# is a local/CI operation.  This keeps the build fast and deterministic.
#
FROM python:3.11-slim AS production

WORKDIR /app

RUN groupadd -r aiservice && useradd -r -g aiservice aiservice

# libgomp1: OpenMP runtime required by XGBoost and scikit-learn at inference time.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source — explicit paths prevent __pycache__, tests,
# .env files, and career_dataset.csv from entering the image.
COPY --chown=aiservice:aiservice api/          ./api/
COPY --chown=aiservice:aiservice models/       ./models/
COPY --chown=aiservice:aiservice utils/        ./utils/
COPY --chown=aiservice:aiservice data/__init__.py          ./data/__init__.py
COPY --chown=aiservice:aiservice data/generate_dataset.py  ./data/generate_dataset.py
COPY --chown=aiservice:aiservice __init__.py gunicorn.conf.py wsgi.py ./

# Render injects PORT at runtime; default matches gunicorn.conf.py
ENV PORT=10000

USER aiservice

EXPOSE 10000

# Generous start-period: the background warmup thread loads ~52 MB of
# compressed artefacts which expand to ~220 MB in RAM.  On a cold Render
# instance this takes 10–30 s.  The healthcheck polls /healthz which
# always returns HTTP 200 once gunicorn is bound.
HEALTHCHECK \
    --interval=30s \
    --timeout=15s \
    --start-period=60s \
    --retries=5 \
    CMD python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:10000/healthz')"

CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:application"]
