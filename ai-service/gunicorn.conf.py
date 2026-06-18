import os
import multiprocessing

# Server socket
bind        = f"0.0.0.0:{os.getenv('PORT', '5050')}"
backlog     = 512

# Workers
workers     = int(os.getenv("WORKERS",  min(multiprocessing.cpu_count() * 2 + 1, 4)))
threads     = int(os.getenv("THREADS",  4))
worker_class = "sync"
timeout     = int(os.getenv("TIMEOUT",  120))
keepalive   = 5
graceful_timeout = 30

# Logging
loglevel    = os.getenv("LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(t)s "%(r)s" %(s)s %(b)s %(D)sµs'
accesslog   = "-"
errorlog    = "-"

# Process naming
proc_name   = "career-ai-service"

# Lifecycle hooks
def on_starting(server):
    server.log.info("Starting Career AI Service…")

def worker_exit(server, worker):
    server.log.info("Worker %d exited (pid: %d)", worker.age, worker.pid)
