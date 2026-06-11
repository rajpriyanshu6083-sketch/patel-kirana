# Patel Groceries Project

A minimal Flask storefront project with a frontend served from `templates/index.html`.

## Setup

1. Create a Python virtual environment (recommended):

```bash
python -m venv venv
```

2. Activate the environment:

- PowerShell:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
- Command Prompt:
  ```cmd
  .\venv\Scripts\activate.bat
  ```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

Open the app in your browser at:

- `http://127.0.0.1:5000`

## Project structure

- `app.py` — Flask server entry point
- `requirements.txt` — Python dependencies
- `templates/index.html` — frontend UI

## Notes

- The Flask server is running in development mode.
- For production, use a proper WSGI server such as Gunicorn or uWSGI.
