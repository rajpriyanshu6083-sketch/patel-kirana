# Patel Kirana (Patel Groceries)

## What This Is
Patel Kirana is a lightweight, local web application designed for a neighborhood grocery store (Patel Groceries) in India. It enables local customers to log in securely via OTP, browse products, place orders (Cash on Delivery or UPI), and manage their account details and Khata (store credit) balances, while providing the store owner with a control dashboard to manage orders, update order status, and verify UPI transactions.

## Core Value
To provide a fast, local network-accessible grocery ordering system that enables neighborhood customers to place orders easily and helps the owner keep track of order payments and Khata balances without complex setups.

## Requirements

### Validated
- ✓ Secure customer authentication using 6-digit one-time passwords (OTP) sent via Gmail SMTP — existing
- ✓ Customer profile management (persisting name, phone, email, delivery addresses, and store credit/Khata balances) — existing
- ✓ Product listing and local shopping cart execution (client-side JS state) — existing
- ✓ Multi-mode payment support (Cash on Delivery or merchant UPI payment QR code) — existing
- ✓ Asynchronous email alerts notifying the store owner of incoming orders — existing
- ✓ Owner administrative dashboard supporting authentication, UPI verification, status updating, and order cancellations — existing
- ✓ LAN accessibility support via custom `/mobile` endpoint showing scannable QR code — existing
- ✓ PWA static resource caching via Service Worker (`static/sw.js`) — existing

### Active
- [ ] Refactor the monolithic `app.py` file to separate database helpers, routes, and services (SMTP/SMS) into modular components to improve maintainability and speed up future development.
- [ ] Improve client-side JavaScript structure in `templates/index.html` (e.g., extract embedded scripts into a standalone `static/js/app.js` file) to prevent brackets/braces parsing issues.
- [ ] Add comprehensive integration and unit tests for order placement, payment verification, and user management APIs to guarantee execution correctness during future updates.

### Out of Scope
- Online Payment Gateway Integrations (e.g., Razorpay, Stripe) — Static UPI QR code and manual verification are preferred to keep transaction costs at zero.
- Cloud DB Hosting — Local SQLite persistence is sufficient for the target LAN deployment.

## Context
- The system runs locally on the shop owner's Windows machine and is made accessible over the local WiFi network using WSGI (Waitress) and the host's LAN IP address.
- SMS support via Fast2SMS API exists but is optional (falls back gracefully to log warnings if credentials are omitted).
- A braces verification system (`check.py` / `check3.py`) is used in development to monitor script integrity in the HTML template.

## Constraints
- **Database**: SQLite — Restricted to local disk storage.
- **Server Platform**: Waitress on Windows — The app must run stably and securely on standard Windows systems without requiring WSGI containers like Gunicorn.
- **Client Deployment**: Progressive Web App (PWA) — Requires HTTPS or `localhost`/LAN IP addresses to run the service worker safely.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite database persistence | Simplest and fastest local database for single-device deployment, requiring zero setup overhead. | ✓ Good |
| SMTP delivery for OTP | Bypasses carrier DLT registration rules and SMS costs, sending login codes directly to customer email addresses. | ✓ Good |
| In-memory orders dict | Provides fast client polling, though it poses desynchronization risks in multi-threaded serving environments. | ⚠️ Revisit |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-11 after GSD Project Initialization*
