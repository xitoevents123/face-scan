"""
Gunicorn entry point — pre-warms the face model at startup so the
first real request is fast instead of blocking for 5-10 seconds.
"""
from main import create_flask_app, get_face_app
import sys

print("Pre-loading face detection model...", flush=True)
try:
    get_face_app("index")
    print("Face model ready.", flush=True)
except Exception as e:
    print(f"Warning: failed to pre-load model: {e}", file=sys.stderr, flush=True)

application = create_flask_app()
