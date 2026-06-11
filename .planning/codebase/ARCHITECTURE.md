# Architecture

**Analysis Date:** 2026-06-11

## Pattern Overview

**Overall:** Flask Web Monolith (MVC-like / Single File Backend)

**Key Characteristics:**
- **Single-File Backend Monolith:** Almost all routing, business logic, configuration, and data utility functions are housed in `app.py`.
- **Hybrid Templated / API UI:** Renders a primary Jinja2 template (`templates/index.html`) which runs a dynamic JavaScript client-side application communicating via REST JSON APIs.
- **Dual State Backend:** Persists state to a local SQLite database (`patel_data.db`) while keeping active orders cached in-memory in a global `orders` dictionary.
- **PWA Capabilities:** Employs a service worker (`static/sw.js`) to cache static resources and enable basic offline capabilities.

## Layers

**Routing & Controller Layer (app.py):**
- Purpose: Map web endpoints to request handlers, manage sessions, process input payloads, and return JSON responses or render Jinja templates.
- Contains: Flask routes prefixed with `/api/` (for JSON communication) and HTML rendering routes (`/` and `/mobile`).
- Depends on: Model/Data Helpers, Python Standard Library (smtplib, sqlite3, os).
- Used by: HTTP Clients (Browser).

**Model & Data Persistence Layer (app.py):**
- Purpose: Execute SQL statements against SQLite and synchronize persistent records with in-memory application caches.
- Contains: Database helper functions starting with an underscore (e.g., `_get_db`, `_init_db`, `_reload_orders_from_db`, `_save_order`, `_load_customer`).
- Depends on: `sqlite3`.
- Used by: Route handlers in the Controller Layer.

**View Layer (templates/ & static/):**
- Purpose: Render pages, manage client-side application state, display user interfaces, and handle interactions.
- Contains: Jinja2 HTML templates, styling files, assets, and service worker scripts.
- Location: `templates/index.html`, `templates/mobile_access.html`, `static/sw.js`.
- Used by: End Users.

## Data Flow

**Customer Placing an Order:**
1. Customer selects items on the web UI and clicks "Place Order" (payment method can be "cash" or "upi").
2. Client-side JS posts a JSON payload to `/api/place-order`.
3. Route handler `api_place_order()` in `app.py` validates the payload, generates a unique order ID, and logs details.
4. Database helper `_save_order()` inserts/replaces the order record in SQLite and caches it in the global `orders` dictionary.
5. If the payment method is UPI, a pending UPI payload is returned, prompting the client to display UPI payment instructions and a QR code.
6. The client app starts polling `/api/payment-status/<order_id>` to check when the owner verifies the payment.
7. An email is asynchronously sent to the store owner alerting them of the new order.

**Owner Verifying a Payment:**
1. The store owner logs in to their dashboard and views pending UPI orders.
2. The owner clicks "Confirm" or "Reject" on a pending order.
3. Client-side JS posts to `/api/owner/verify-payment` containing the `order_id` and the `action`.
4. Route handler `api_owner_verify_payment()` updates the payment status (`paid_upi` or `rejected`) and updates the order status in SQLite and the in-memory cache.
5. If verified, the polling client receives the status update and shows a success screen.

## Entry Points

**Waitress WSGI Server:**
- Location: `wsgi.py`
- Triggers: Execution of `wsgi.py` or command `waitress-serve --host=0.0.0.0 --port=5000 wsgi:application`
- Responsibilities: Imports the Flask application instance (`application`) and serves it across local LAN.

**Flask Development Runner:**
- Location: `app.py`
- Triggers: Direct execution of `python app.py` (when `__name__ == '__main__'`)
- Responsibilities: Runs the Flask built-in development server on port 5000.

## Error Handling

**Strategy:** Exception catching inside helper functions and route controllers, returning HTTP status codes and JSON error objects to the client.

**Patterns:**
- Try/catch blocks in database helpers (returns default/empty states or raises).
- Custom database connection retrieval (`_get_db`) with automatic connection closing via context manager/flask teardown.
- Validation checks at the API entry point (e.g. checking length of phone number) returning `400 Bad Request` with `{"success": false, "message": "..."}`.

## Cross-Cutting Concerns

**Logging:**
- Standard Python `logging` library configured to `DEBUG` level. Logs setup info, SMTP status, and API actions to stdout.

**Authentication & Sessions:**
- Flask `session` object (cookie-based state with `app.secret_key`) keeps track of verified customer logins (using phone and OTP authentication) and owner login sessions.

---

*Architecture analysis: 2026-06-11*
*Update when major patterns change*
