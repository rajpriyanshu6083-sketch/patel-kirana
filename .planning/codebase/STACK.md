# Technology Stack

**Analysis Date:** 2026-06-11

## Languages

**Primary:**
- Python 3.10+ - Backend application logic, routing, and database interactions.
- JavaScript (ES6) - Client-side logic, service worker, dynamic UI, cart management, and API calls.
- HTML5 / CSS3 - Frontend UI templates and layouts.

## Runtime

**Environment:**
- Python 3 - Local interpreter executing Flask app.
- Modern Web Browsers - For client-side rendering and local progressive web app (PWA) runtime.

**Package Manager:**
- pip - Python package installer.
- Requirements file: `requirements.txt` present.

## Frameworks

**Core:**
- Flask >= 2.0 - Micro web framework for routing, requests, and template rendering.
- Waitress >= 3.0 - Production-ready WSGI server for Windows/Linux hosts.

**Testing:**
- unittest (Python standard library) - Automated backend API testing.

## Key Dependencies

**Critical:**
- sqlite3 (Python standard library) - Database engine for persistent storage of orders, users, and customers.
- smtplib (Python standard library) - SMTP client for sending verification codes (OTPs) via Gmail.
- python-dotenv - Loads variables from `.env` file into runtime environment.

## Configuration

**Environment:**
- `.env` file - Contains Flask session keys, Gmail SMTP credentials (`GMAIL_ADDRESS`, `GMAIL_PASSWORD`), and other configuration secrets.

**Build:**
- None - Vanilla Python running dynamically without compilation.

## Platform Requirements

**Development:**
- Windows/macOS/Linux with Python 3 and Node.js (for npx/npm commands).

**Production:**
- Any machine capable of running Python 3 (typically hosted locally with Waitress, or on Linux VPS with Gunicorn/Nginx).

---

*Stack analysis: 2026-06-11*
*Update after major dependency changes*
