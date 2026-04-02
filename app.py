"""
Render/production-friendly entrypoint.

This repo's main Flask app currently lives in a file named "python app.py" (with a space),
which is awkward to reference in many deploy environments. This wrapper loads that file
and exposes the Flask `app` (and optional `socketio`) under a conventional module name.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

_APP_PATH = Path(__file__).with_name("python app.py")

if not _APP_PATH.exists():
    raise FileNotFoundError(f"Expected app source file not found: {_APP_PATH}")

_spec = importlib.util.spec_from_file_location("yan_app", _APP_PATH)
if _spec is None or _spec.loader is None:
    raise RuntimeError(f"Failed to create module spec for: {_APP_PATH}")

_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]

app = _mod.app  # type: ignore[attr-defined]
socketio = getattr(_mod, "socketio", None)


def main() -> None:
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    if socketio is not None:
        # Flask-SocketIO blocks running with Werkzeug in "production" unless explicitly allowed.
        # Render's default start command often uses this entrypoint; keep it working without
        # requiring eventlet/gevent. If you later move to gunicorn+eventlet/gevent, you can
        # remove this.
        socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
    else:
        app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    main()
