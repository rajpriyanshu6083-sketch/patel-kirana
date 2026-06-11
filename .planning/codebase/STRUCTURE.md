# Codebase Structure

**Analysis Date:** 2026-06-11

## Directory Layout

```
patel kirana/
├── .agent/              # GSD Core skills, agents, and configurations
├── .git/                # Git repository version control metadata
├── scratch/             # Scratch scripts and trial code (gitignored)
├── static/              # Static assets, PWA configurations, and assets
│   ├── icons/           # App icons for the PWA
│   └── sw.js            # PWA Service Worker script
├── templates/           # Jinja2 HTML templates for page layouts
│   ├── index.html       # Main customer/owner interface template
│   └── mobile_access.html # Mobile access and QR display template
├── .env                 # Environment secrets and config (gitignored)
├── .gitignore           # Git ignore patterns
├── app.py               # Monolithic backend file (routes, logic, DB)
├── check.py             # Braces verification script for templates
├── check3.py            # Improved regex-based braces verification script
├── patel_data.db        # SQLite database store (gitignored)
├── requirements.txt     # Python dependency list
├── test_app.py          # Python unittest test cases
└── wsgi.py              # Production entry point using Waitress
```

## Directory Purposes

**scratch/**
- Purpose: Host temporary trial/debug scripts.
- Contains: Inline helper tests (e.g. session cookie tests, login step simulations).
- Key files: `scratch/check_all_balanced.py` (checks balanced UI structures).

**static/**
- Purpose: Serve public static resources (images, service worker, styling assets).
- Contains: Product images (`sprite.png`, `eggs.png`), PWA webmanifest, and Service Worker (`sw.js`).
- Key files: `static/sw.js` (PWA caching worker), `static/manifest.json` (PWA credentials).

**templates/**
- Purpose: Store Jinja2 templates rendered by Flask routes.
- Contains: HTML files containing inline style, script, and layouts.
- Key files: `templates/index.html` (the primary application SPA template).

## Key File Locations

**Entry Points:**
- `app.py` - Flask app initialization and routes.
- `wsgi.py` - Production web server (Waitress) startup.

**Configuration:**
- `requirements.txt` - Project dependencies.
- `.env` - Environment secrets.
- `.gitignore` - Path exclusions.

**Core Logic:**
- `app.py` - Contains all Flask routes, model handlers, SMTP operations, and SQLite queries.

**Testing:**
- `test_app.py` - Backend API testing via `unittest`.

## Naming Conventions

**Files:**
- snake_case.py: Python source and test files.
- snake_case.png/jpg: Static images.
- UPPERCASE: Environment configuration files.

**Directories:**
- Plural names for templates/assets: `templates/`, `static/`.
- Hidden dot prefix for agent config: `.agent/`, `.git/`.

## Where to Add New Code

**New API Endpoint:**
- Definition and handler: Add a new `@app.route` decorator and function inside `app.py`.
- Tests: Add a test method prefixed with `test_` in `test_app.py`.

**New Client Feature:**
- Add HTML markup in `templates/index.html`.
- Add script logic inside the `<script>` tag of `templates/index.html`.
- Add stylesheet declarations inside the `<style>` tag of `templates/index.html` or in a new file in `static/`.

**New Persistence Models:**
- Schema structure: Update `_init_db()` in `app.py` with SQL schema statements.
- CRUD helpers: Add database helper methods starting with an underscore (e.g. `_load_something()`) in `app.py`.

---

*Structure analysis: 2026-06-11*
*Update when directory structure changes*
