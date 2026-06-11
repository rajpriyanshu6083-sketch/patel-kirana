# Codebase Concerns

**Analysis Date:** 2026-06-11

## Tech Debt

**Monolithic Backend File (`app.py`):**
- Issue: `app.py` contains almost 1,000 lines of code, serving routes, email compositions, SMS triggers, database utilities, and application configuration.
- Why: Simple prototype architecture developed quickly.
- Impact: Difficult to maintain, navigate, and unit test isolated sections.
- Fix approach: Modularize into directories: `routes/`, `models/`, `services/` (for SMS/Email), and `config.py`.

**In-Memory Cache Synchronization (`app.py`):**
- Issue: Active orders are cached in a global dictionary `orders` in memory and updated in-place alongside SQLite write calls.
- Why: Avoid constant SQLite parsing and deserialization for status polling.
- Impact: In a multi-threaded or multi-process WSGI environment (like Waitress running multiple threads), race conditions or state desynchronization can occur.
- Fix approach: Query SQLite directly with proper indices for order status polling, or use a lightweight cache database (like Redis) if scaling.

## Security Considerations

**Fallback Flask Session Secret (`app.py`):**
- Risk: `app.secret_key = os.environ.get('SECRET_KEY', 'replace-this-with-a-secure-key')` fallback uses a publicly guessable key.
- Current mitigation: Relies on the user setting `SECRET_KEY` in `.env`.
- Recommendations: Raise a RuntimeError if `SECRET_KEY` is not set in production.

**Password Hashing implementation (`app.py`):**
- Risk: Need to verify if password hashing utilizes secure, industry-standard algorithms (e.g. bcrypt/pbkdf2) rather than weak cryptographic hashes (e.g. MD5 or SHA256).
- Recommendations: Audit the hashing library in use to ensure bcrypt or pbkdf2 is utilized.

## Fragile Areas

**Curly Braces Balance in JavaScript (`templates/index.html`):**
- Why fragile: The entire client-side frontend is a Single Page Application embedded inside a single `<script>` block in `templates/index.html`. It has become so large and nested that scripts like `check.py` and `check3.py` are needed just to verify braces balance.
- Common failures: Adding nested logic in JS templates easily causes syntax or parsing errors.
- Safe modification: Split client-side JS out of the HTML file into a separate static asset (`static/js/app.js`) or compile it.
- Test coverage: No tests exist for client-side HTML or JS functionality.

## Test Coverage Gaps

**Client-side JS/UI Testing:**
- What's not tested: Cart updates, checkout logic, payment modals, and owner dashboard transitions on the client side.
- Risk: UI changes could silently break payment triggers or checkout requests.
- Priority: Medium
- Difficulty to test: Requires setting up a browser automation framework (e.g., Playwright or Selenium).

---

*Concerns audit: 2026-06-11*
*Update as issues are fixed or new ones discovered*
