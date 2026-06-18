# ── Stage 1: build deps ───────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps for numpy/scipy native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ gfortran libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: training stage (optional — pre-trains model) ────────
FROM python:3.11-slim AS trainer

WORKDIR /app
COPY --from=builder /install /usr/local
COPY . .

RUN python -c "from data.generate_dataset import generate_dataset; generate_dataset(12000, 'data/career_dataset.csv')" && \
    python models/train.py --no-tune && \
    echo "Training complete"


# ── Stage 3: production runtime ───────────────────────────────────
FROM python:3.11-slim AS production

WORKDIR /app

# Non-root user
RUN groupadd -r aiservice && useradd -r -g aiservice aiservice

# Runtime libs only (no gcc etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 libopenblas0 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages
COPY --from=builder /install /usr/local

# Copy application code
COPY --chown=aiservice:aiservice . .

# Copy trained artefacts from training stage
COPY --from=trainer --chown=aiservice:aiservice /app/data/career_dataset.csv ./data/
COPY --from=trainer --chown=aiservice:aiservice /app/models/artefacts ./models/artefacts

# Create log dir
RUN mkdir -p logs && chown aiservice:aiservice logs

USER aiservice

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5050/healthz')"

CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:application"]
