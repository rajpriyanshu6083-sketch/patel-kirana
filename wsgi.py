"""
wsgi.py — WSGI entry point for Patel Groceries app.

Usage with Waitress (Windows):
    waitress-serve --host=0.0.0.0 --port=5000 wsgi:application

Usage with Gunicorn (Linux/macOS):
    gunicorn --bind 0.0.0.0:5000 --workers 4 wsgi:application
"""

from app import app as application  # noqa: F401

if __name__ == "__main__":
    # Quick smoke-test: run via Waitress when called directly
    from waitress import serve
    serve(application, host="0.0.0.0", port=5000, threads=4)
