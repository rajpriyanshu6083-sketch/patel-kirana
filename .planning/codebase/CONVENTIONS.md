# Coding Conventions

**Analysis Date:** 2026-06-11

## Naming Patterns

**Files:**
- snake_case.py for Python source files (e.g., `app.py`, `wsgi.py`).
- snake_case.py prefixed with `test_` for Python tests (e.g., `test_app.py`).
- snake_case.png/jpg for images.

**Functions:**
- snake_case for all Python functions (e.g., `send_email_gmail()`, `compose_otp_email()`).
- Underscore prefix `_` for helper functions or data persistence functions (e.g., `_get_db()`, `_save_order()`).
- camelCase for client-side JavaScript functions (e.g., `toggleCart()`, `login()`, `placeOrder()`).

**Variables:**
- snake_case for Python variables (e.g., `otp_code`, `verify_payload`).
- camelCase for JavaScript variables (e.g., `cartItems`, `otpCode`).
- UPPER_SNAKE_CASE for global constants (e.g., `DB_PATH`, `OWNER_UPI_ID`, `GMAIL_ADDRESS`).

**CSS:**
- kebab-case for CSS class names (e.g., `.cart-item`, `.btn-primary`, `.order-card`).

## Code Style

**Formatting:**
- PEP 8 guidelines for Python code style.
- 4-space indentation for Python, 2-space indentation for HTML, CSS, and JS templates.
- Explicit returns in Flask route functions, using `jsonify` for API outputs.

**Linting:**
- No strict lint settings, but follows Python standard clean style.
- Inline CSS and JavaScript in HTML templates (`templates/index.html`).

## Error Handling

**Backend Strategy:**
- Wrap database, email, and network transactions in try/except blocks.
- Log failures using the `logger` instance.
- Return structured error JSON payloads to the frontend: `{'success': False, 'message': 'Detailed error message'}`, alongside proper HTTP status codes (e.g., `400` or `500`).
- Early return checks for API parameters validation:
  ```python
  if not phone.isdigit() or len(phone) != 10:
      return jsonify({'success': False, 'message': 'Please enter a valid 10-digit phone number.'}), 400
  ```

**Database connection closing:**
- Use context managers `with _get_db() as conn:` to ensure databases connection states are always closed safely.

## Logging

**Framework:**
- Python standard library `logging` module.
- Logger instance initialized as `logger = logging.getLogger(__name__)`.
- Levels: `logger.debug()` for detail tracking, `logger.info()` for status changes, `logger.warning()` for non-critical alerts, and `logger.error()` for API or authentication failures.

## Comments

**Guidelines:**
- Use short docstrings for function-level explanation.
- Include single line comments explaining complex backend SQL queries or client-side UI workflows.
- No obsolete/redundant comments.

---

*Convention analysis: 2026-06-11*
*Update when patterns change*
