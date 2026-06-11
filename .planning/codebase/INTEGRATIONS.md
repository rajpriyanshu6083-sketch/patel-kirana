# External Integrations

**Analysis Date:** 2026-06-11

## APIs & External Services

**Email Services:**
- Gmail SMTP - Sending customer OTPs and owner notifications.
  - Integration method: Python built-in `smtplib.SMTP_SSL` on port 465.
  - Auth: Credentials loaded via `GMAIL_ADDRESS` and `GMAIL_PASSWORD` environment variables (expects Gmail App Password).

**SMS Services:**
- Fast2SMS API (`https://www.fast2sms.com/dev/bulkV2`) - Sending SMS notifications (DLT-free route) to customers and the store owner.
  - Integration method: HTTP POST requests using Python's built-in `urllib.request`.
  - Auth: `authorization` header set to the token loaded from the `FAST2SMS_KEY` environment variable.
  - Rate limits: Subject to Fast2SMS account limits/credits.

## Data Storage

**Databases:**
- SQLite (local file database: `patel_data.db`) - Stores orders, customer details, and owner credentials.
  - Connection: Managed in-thread using Python's standard `sqlite3` library.
  - Client: Direct SQL queries (no ORM).
  - Migrations: In-code table initialization in `_init_db()` if the database does not exist.

## Payments & Financials

**UPI Payments:**
- UPI QR Code / Payment links - Customers pay via UPI scanner/apps.
  - Implementation: Static merchant/owner UPI ID (`6206709800@nyes`) used to construct UPI intent URLs and payment instructions.
  - Verification: Manual owner confirmation. The owner is notified, reviews the payment, and clicks "Confirm" or "Reject" in the owner dashboard.

## Environment Configuration

**Development:**
- Required env vars:
  - `SECRET_KEY` - Flask session secret.
  - `GMAIL_ADDRESS` - Sending Gmail address.
  - `GMAIL_PASSWORD` - Gmail App Password.
  - `FAST2SMS_KEY` - Fast2SMS API Auth Token (optional in dev, falls back to logging if not set).
  - `OWNER_PHONE` - Store owner phone number for receiving SMS alerts.
- Secrets Location: `.env` file in the project root (gitignored).

---

*Integration audit: 2026-06-11*
*Update when adding/removing external services*
