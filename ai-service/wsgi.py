"""WSGI entry point for Gunicorn production server."""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from api.app import create_app

application = create_app()

if __name__ == "__main__":
    application.run()
