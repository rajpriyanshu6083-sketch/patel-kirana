# Patel Groceries Storefront — System Documentation (Source of Truth)

This document serves as the absolute source of truth, architectural map, and memory hub for the Patel Groceries project. It outlines the system architecture, file organization, tech stack, data flows, and development patterns.

---

## 1. System Overview & Purpose

Patel Groceries is a ultra-local, minimal e-commerce web application designed to facilitate **10-minute grocery and vegetable deliveries** for a local storefront (Patel Kirana). 

### Core Value Proposition
- **Fast, OTP-based Customer Authentication**: Allows users to register or log in securely using a 10-digit phone number and email-based one-time passwords (OTP).
- **UPI QR Integration & Verification Flow**: Generates dynamic payment links and QR codes for customer checkout. Features a dashboard where the owner verifies payment claims in real-time.
- **Store Credit Ledger (Khata)**: Tracks digital credit balances for trusted regular customers.
- **Support Ticket Pipeline**: Provides customers with a simple form to submit help tickets (e.g. delivery issues) and an owner interface to manage and resolve them.
- **Inventory Overrides**: Allows the store owner to toggle item stock levels, update pricing, and edit product details dynamically.

---

## 2. Tech Stack & Core Dependencies

The application is split into a Python Flask backend and a highly interactive, vanilla JavaScript single-page frontend.

### Backend Stack
- **Framework**: Flask (Python >= 2.0)
- **WSGI Production Servers**: Waitress (on Windows), Gunicorn (on Linux)
- **Configuration**: Python-dotenv (for environment variable injection)

### Database Layer
- **Engine**: SQLite 3
- **Configuration**: Thread-safe database access with Write-Ahead Logging (`WAL` mode) enabled for multi-user concurrency and `foreign_keys=ON` for structural integrity.

### Frontend Stack
- **Structure & Layout**: Semantic HTML5, FontAwesome Icons.
- **Styling**: Vanilla CSS utilizing custom HSL color variables, dark theme variables, custom glassmorphism components, and responsive grid layouts.
- **Interactivity**: Vanilla ES6 JavaScript. No heavy client-side framework (React/Vue) is used.
- **Libraries**:
  - **Leaflet.js & OpenStreetMap**: Embedded interactive map picker for coordinate-accurate delivery tracking.
  - **QRCode.js**: Client-side QR generation for dynamic UPI payments.

### Real-Time Update Mechanism
- **Server-Sent Events (SSE)**: The application utilizes a persistent EventSource stream (`/api/stream`) to broadcast backend events (`new_order`, `order_updated`, `inventory_updated`, and `ticket_updated`) dynamically to authenticated sessions, triggering immediate, silent UI refreshes.

---

## 3. Architecture & File Structure

```
patel kirana/
├── .env                       # Local environment variables (Port, SECRET_KEY, GMAIL, SMS keys)
├── app.py                     # Primary Flask backend server (routing & HTTP endpoints)
├── db_utils.py                # Database queries and schema definitions (SQL operations)
├── requirements.txt           # Python application dependencies
├── wsgi.py                    # Production WSGI server entry-point
├── check.py & check3.py       # Syntax checking utilities (validates JS brackets & syntax)
├── patel_data.db              # SQLite Database file (generated on init)
├── services/                  # Package for external notification services
│   ├── __init__.py            # Services module entry point
│   ├── email_service.py       # SMTP Email dispatch logic (Gmail TLS configuration)
│   └── sms_service.py         # Fast2SMS integration (SMS gateway triggers)
├── static/                    # Frontend assets
│   ├── logo.png               # Brand icon
│   ├── sw.js                  # PWA Service Worker for local caching
│   └── js/
│       └── app.js             # Main frontend app controller (Single-Page-Application script)
└── templates/                 # HTML templates
    ├── index.html             # Customer Storefront & Owner Dashboard UI
    └── mobile_access.html     # QR code utility for PC-to-Mobile local LAN access
```

### Rationale Behind File Organization
- **Separation of Concerns**: Database operations are separated into `db_utils.py`, notification tasks into `services/`, and Web routing into `app.py`.
- **Vanilla Performance**: Storing client-side logic inside a single `static/js/app.js` file allows browsers to cache it effectively, keeping `templates/index.html` clean.
- **Integration Test Safety**: The database uses thread-local connections so the test runner `test_app.py` can safely isolate the database path during integration sweeps.

---

## 4. Data Flow & State Management

### Database Schema
The database (`patel_data.db`) consists of five tables:
1. **`orders`**: Stores JSON serialized order structures, pricing, and statuses.
2. **`customers`**: Stores profile information (phone, email, name, addresses, and Khata balance).
3. **`inventory_overrides`**: Stores manual stock overrides, prices, and descriptions.
4. **`support_tickets`**: Tracks support inquiries and their status (`pending` or `resolved`).
5. **`owners`**: Stores owner accounts with SHA-256 hashed credentials.

### Frontend State Management
Global client-side state is stored in standard JS objects within `static/js/app.js`:
- `cart`: Tracks product quantities (`{ productId: quantity }`). Persisted in the browser's `localStorage` under `patel_cart`.
- `userProfile`: Stores current user credentials, contact numbers, and Khata balance. Persisted in `localStorage` under `patel_user_profile`.
- `inventory`: Pre-populated default inventory list combined with server overrides fetched dynamically from `/api/inventory/overrides`.

### Order State Transitions
```
[Order Placed]
   │
   ├─► (Payment: CoD / Khata Credit) ──► status: paid_cash/pending ──► [Packing]
   │
   └─► (Payment: UPI QR Claim) ───────► status: pending_verification ──► [Owner Confirms] ──► [Packing] ──► [Out for Delivery] ──► [Delivered]
                                                                    └──► [Owner Rejects] ──► [Cancelled]
```

---

## 5. Key Features & Workflows

### A. Customer Registration & Login (OTP Flow)
1. Customer enters their 10-digit phone number.
2. **Dynamic Check**: The frontend queries `/api/customer/load-profile` (debounced by 300ms) to check if the user is registered:
   - If **Login mode** & account exists: displays "Welcome back".
   - If **Register mode** & account exists: prompts them to switch to Login.
3. Upon clicking submit, `/api/send-otp` generates a 6-digit code. In production, this is sent to the customer's email via an async background thread. In development, it is also saved to `static/otp.txt` for local testing.
4. Customer submits the code to `/api/verify-otp`. Upon success, the session cookie is saved and profile data is stored in client-side state.

### B. Checkout & UPI Payment Flow
1. Cart content is submitted to `/api/place-order` with the selected payment method (`upi`).
2. An order is created in the database with status `pending_verification` (order status: `waiting_payment`).
3. An email containing order details is dispatched to the customer, and email/SMS alerts are fired to the owner.
4. The client storefront generates a UPI link (`upi://pay?pa=...`) and displays it as a QR code.
5. The client initiates a `setInterval` timer polling `/api/payment-status/<order_id>` every 4 seconds as a fallback, while opening a real-time EventSource connection.
6. The owner navigates to their dashboard, reviews the transaction, and clicks **Confirm** (calls `/api/owner/verify-payment`).
7. The EventSource stream instantly receives the `order_updated` event, which updates the checkout UI and renders the success screen immediately.


### C. Owner Password Reset Flow
1. Owner types their username and requests a reset code via `/api/owner/forgot-password-send`.
2. A random 6-digit OTP code is generated, stored in the session, and emailed to the owner's address.
3. Owner submits the code along with their new password to `/api/owner/reset-password`, which verifies the OTP and saves the new SHA-256 password hash.

---

## 6. Development Rules & Patterns

### 1. Database Operations
- **Direct Queries Forbidden in `app.py`**: All SQL executions must reside within `db_utils.py`. The Flask server should import `db_utils` and execute queries through exposed wrapper methods.
- **WAL Configuration**: Always query using `db_utils.get_db()`. Do not override connection configurations that break SQLite WAL locking.

### 2. Frontend Styling Conventions
- **Vanilla CSS Variables**: Maintain color, border-radius, and font parameters inside the `:root` pseudo-class in `templates/index.html`.
- **Modern HSL Coloring**: Use HSL values (e.g. `var(--primary)`) rather than fixed hex colors to keep background/overlay styles readable.
- **Glassmorphism Overlay**: Dialogs and dropdowns should feature backdrop filters and soft gradients:
  `backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);`

### 3. Syntax Checking & Testing
- Before committing frontend JS modifications, execute `python check3.py` to ensure braces are balanced.
- Integration tests in `test_app.py` use isolated temporary databases (`patel_data_test.db`). Ensure all new setups register unlinking operations inside pytest `addCleanup()` blocks.
