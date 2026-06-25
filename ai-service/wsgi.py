"""
WSGI entry point for Gunicorn.

Model loading strategy
-----------------------
Models are NOT loaded during create_app() — doing so blocks the worker
from accepting connections and causes a silent OOM kill on Render Free
(512 MB) because the decompressed RF artifact alone peaks ~180 MB.

Instead a daemon thread starts loading immediately after the worker
binds its socket.  The /healthz endpoint reports "warming_up" during
this window.  /predict returns HTTP 503 until loading completes
(typically 5–15 s on a cold Render instance).
"""

import logging
import os
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from api.app import create_app
from models.predict import get_predictor

logger = logging.getLogger("career_wsgi")

application = create_app()


def _warmup() -> None:
    """Load models in the background so startup doesn't block health checks."""
    try:
        logger.info("Background warmup: loading predictor…")
        get_predictor()
        logger.info("Background warmup: predictor ready")
    except Exception:
        logger.exception("Background warmup: predictor load FAILED")


# Fire-and-forget daemon thread — dies automatically if the worker exits
threading.Thread(target=_warmup, daemon=True, name="predictor-warmup").start()


if __name__ == "__main__":
    port  = int(os.getenv("PORT", "10000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    application.run(host="0.0.0.0", port=port, debug=debug)
