import os

# ── Render Free Tier (512 MB) — Gunicorn configuration ───────────────────────
#
# CRITICAL CONSTRAINT: each Gunicorn worker loads the full ML model set.
# With CalibratedClassifierCV(cv=3) the RF artifact alone expands to ~180 MB
# uncompressed in RAM. 2 workers = ~360 MB just for models → OOM.
#
# Solution: 1 worker + gthread so multiple concurrent requests share one
# in-process model object instead of duplicating it across OS processes.

bind             = f"0.0.0.0:{os.getenv('PORT', '10000')}"
backlog          = 64

# 1 worker only — non-negotiable on Render Free 512 MB.
workers          = 1

# gthread: single process, N threads. Threads share the same model objects
# in memory — zero RAM cost for concurrency vs. worker-based parallelism.
worker_class     = "gthread"
threads          = int(os.getenv("THREADS", "2"))

# Generous timeout: cold-start model load takes 5–15 s; inference with
# feature-driver permutations (~40 predict_proba calls) can take 2–8 s.
timeout          = int(os.getenv("TIMEOUT", "120"))
graceful_timeout = 30
keepalive        = 2

loglevel         = os.getenv("LOG_LEVEL", "info")
accesslog        = "-"
errorlog         = "-"
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(D)sus'

proc_name        = "mentor-chain-service"


def on_starting(server):
    server.log.info(
        "MentorChain AI Service starting — "
        "1 worker × %s threads (gthread), timeout=%ss",
        os.getenv("THREADS", "2"),
        os.getenv("TIMEOUT", "120"),
    )


def worker_exit(server, worker):
    server.log.warning("Worker %d exited (pid %d)", worker.age, worker.pid)
