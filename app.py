import os
import sys
import json
import random
import sqlite3
import smtplib
import logging
import threading
from pathlib import Path
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, render_template, request, jsonify, session

# Load environment variables from .env file
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path, override=True)

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'replace-this-with-a-secure-key')

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Gmail SMTP Configuration
import services
import db_utils

GMAIL_ADDRESS = os.environ.get('GMAIL_ADDRESS')
GMAIL_PASSWORD = os.environ.get('GMAIL_PASSWORD')

# Debug: Print configuration on startup
logger.info(f"\n{'='*60}")
logger.info("GMAIL CONFIGURATION:")
logger.info(f"GMAIL_ADDRESS: {GMAIL_ADDRESS if GMAIL_ADDRESS else 'NOT SET'}")
logger.info(f"GMAIL_PASSWORD: {'*' * len(GMAIL_PASSWORD) if GMAIL_PASSWORD else 'NOT SET'}")
logger.info(f"{'='*60}\n")

def send_email_gmail(recipient: str, subject: str, body: str) -> bool:
    services.email_service.GMAIL_ADDRESS = GMAIL_ADDRESS
    services.email_service.GMAIL_PASSWORD = GMAIL_PASSWORD
    return services.send_email_gmail(recipient, subject, body)

def compose_otp_email(name: str, otp_code: str) -> str:
    return services.compose_otp_email(name, otp_code)


@app.route('/')
def home():
    return render_template('index.html')


@app.route('/sw.js')
def serve_sw():
    return app.send_static_file('sw.js')


@app.route('/mobile')
def mobile_access():
    """Mobile access page with QR code — open this on the PC to get a scannable link."""
    return render_template('mobile_access.html')


@app.route('/api/network-info')
def network_info():
    """Return the server's LAN IP so the mobile access page can display it."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = '127.0.0.1'
    return jsonify({'ip': local_ip, 'port': 5000, 'url': f'http://{local_ip}:5000/'})


@app.route('/api/test')
def api_test():
    return jsonify({
        'gmail_address': GMAIL_ADDRESS or 'NOT SET',
        'gmail_password_length': len(GMAIL_PASSWORD) if GMAIL_PASSWORD else 0,
        'message': 'Test endpoint'
    })


@app.route('/api/send-otp', methods=['POST'])
def api_send_otp():
    data = request.get_json() or {}
    phone = data.get('phone', '').strip()
    action = data.get('action', '').strip()

    if not phone.isdigit() or len(phone) != 10:
        return jsonify({'success': False, 'message': 'Please enter a valid 10-digit phone number.'}), 400

    name = data.get('name', '').strip()
    email = data.get('email', '').strip()

    profile = _load_customer(phone)

    if action == 'login':
        if not profile:
            return jsonify({'success': False, 'message': 'Account not found. Please register first.'}), 404
        name = profile['name']
        email = profile['email']
    elif action == 'register':
        if profile:
            return jsonify({'success': False, 'message': 'Phone number already registered. Please login instead.'}), 400
        if not name or not email:
            return jsonify({'success': False, 'message': 'Name, email, and phone are required for registration.'}), 400
        if '@' not in email or '.' not in email:
            return jsonify({'success': False, 'message': 'Please enter a valid email address.'}), 400
    else:
        # Fallback / backward compatibility
        if not name or not email:
            if profile:
                name = profile['name']
                email = profile['email']
            else:
                return jsonify({'success': False, 'message': 'Name, email, and phone are required.'}), 400
        if '@' not in email or '.' not in email:
            return jsonify({'success': False, 'message': 'Please enter a valid email address.'}), 400

    otp_code = f"{random.randint(100000, 999999)}"
    session['otp_code'] = otp_code
    session['otp_email'] = email
    session['otp_phone'] = phone
    session['otp_name'] = name

    if not GMAIL_ADDRESS or not GMAIL_PASSWORD:
        logger.error("Gmail credentials not configured on the server.")
        return jsonify({'success': False, 'message': 'Email configuration is missing on the server. Please contact administrator.'}), 500

    try:
        logger.info(f"\nSENDING OTP EMAIL")
        logger.info(f"From: {GMAIL_ADDRESS}")
        logger.info(f"To: {email}")
        logger.info(f"Name: {name}")
        logger.info(f"OTP Code: {otp_code}")
        email_body = compose_otp_email(name, otp_code)
        send_email_gmail(email, 'Your Patel Groceries Login Code', email_body)
        logger.info(f"OTP EMAIL SENT SUCCESSFULLY")
    except Exception as exc:
        logger.error(f"ERROR SENDING OTP EMAIL: {str(exc)}")
        return jsonify({'success': False, 'message': f'Unable to send OTP email: {str(exc)}'}), 500

    return jsonify({'success': True, 'message': 'A secure OTP has been sent to your email address.'})


@app.route('/api/verify-otp', methods=['POST'])
def api_verify_otp():
    data = request.get_json() or {}
    otp = data.get('otp', '').strip()
    stored_otp = session.get('otp_code')

    if not stored_otp:
        return jsonify({'success': False, 'message': 'No OTP request was found. Please request a new code.'}), 400

    if otp != stored_otp:
        return jsonify({'success': False, 'message': 'Incorrect OTP. Please try again.'}), 400

    session.pop('otp_code', None)
    return jsonify({
        'success': True,
        'message': 'OTP verified successfully.',
        'name': session.get('otp_name'),
        'email': session.get('otp_email'),
        'phone': session.get('otp_phone')
    })


# ──────────────────────────────────────────────────────────────
#  PERSISTENT STORAGE  (SQLite)
# ──────────────────────────────────────────────────────────────
import uuid, time
from contextlib import contextmanager

DB_PATH = Path(__file__).parent / 'patel_data.db'

@contextmanager
def _get_db():
    """Open a thread-local SQLite connection with WAL mode for concurrency, ensuring it is closed."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def _init_db():
    """Create tables if they don't exist and load data into memory."""
    with _get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id          TEXT PRIMARY KEY,
                data        TEXT NOT NULL,
                created_at  REAL NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS customers (
                phone       TEXT PRIMARY KEY,
                email       TEXT,
                name        TEXT,
                addresses   TEXT DEFAULT '[]',
                khata_bal   REAL DEFAULT 0,
                first_seen  REAL NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS inventory_overrides (
                product_id  INTEGER PRIMARY KEY,
                in_stock    INTEGER NOT NULL DEFAULT 1,
                price       REAL,
                updated_at  REAL NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS owners (
                username    TEXT PRIMARY KEY,
                password    TEXT NOT NULL,
                name        TEXT,
                email       TEXT,
                phone       TEXT,
                created_at  REAL NOT NULL
            )
        ''')
        admin_exists = conn.execute("SELECT 1 FROM owners WHERE username = 'admin'").fetchone()
        if not admin_exists:
            import hashlib, time
            hashed = hashlib.sha256('admin'.encode()).hexdigest()
            conn.execute(
                "INSERT INTO owners (username, password, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ('admin', hashed, 'Owner Admin', 'owner@patelgroceries.com', '+91 0000000000', time.time())
            )
        conn.commit()
    # Load persisted orders into the in-memory dict
    _reload_orders_from_db()
    logger.info(f"DB initialised at {DB_PATH}")

def _reload_orders_from_db():
    """Populate the global `orders` dict from SQLite."""
    global orders
    with _get_db() as conn:
        rows = conn.execute('SELECT id, data FROM orders').fetchall()
    orders = {row[0]: json.loads(row[1]) for row in rows}
    logger.info(f"Loaded {len(orders)} orders from DB")

def _save_order(order: dict):
    """Upsert a single order into SQLite (called after every mutation)."""
    with _get_db() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO orders (id, data, created_at) VALUES (?, ?, ?)',
            (order['id'], json.dumps(order), order.get('created_at', time.time()))
        )
        conn.commit()

def _delete_order(order_id: str):
    """Permanently remove an order from SQLite."""
    with _get_db() as conn:
        conn.execute('DELETE FROM orders WHERE id = ?', (order_id,))
        conn.commit()

def _save_customer(phone: str, email: str, name: str, addresses: list, khata_bal: float):
    """Upsert customer profile data (called on login / address / khata change)."""
    with _get_db() as conn:
        conn.execute(
            '''INSERT INTO customers (phone, email, name, addresses, khata_bal, first_seen)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(phone) DO UPDATE SET
                   email=excluded.email, name=excluded.name,
                   addresses=excluded.addresses, khata_bal=excluded.khata_bal''',
            (phone, email, name, json.dumps(addresses), khata_bal, time.time())
        )
        conn.commit()

def _load_customer(phone: str):
    """Return saved customer data or None."""
    with _get_db() as conn:
        row = conn.execute(
            'SELECT email, name, addresses, khata_bal FROM customers WHERE phone = ?',
            (phone,)
        ).fetchone()
    if not row:
        return None
    return {
        'email': row[0], 'name': row[1],
        'addresses': json.loads(row[2] or '[]'),
        'khata_bal': row[3] or 0
    }

# Initialise DB on import
_init_db()

# ──────────────────────────────────────────────────────────────
#  ORDER MANAGEMENT  (memory-backed, SQLite-persisted)
# ──────────────────────────────────────────────────────────────
# In-memory dict (source of truth while app is running)
# SQLite is the persistent backing store
orders: dict = {}   # populated by _init_db() → _reload_orders_from_db()

OWNER_UPI_ID   = '6206709800@nyes'
OWNER_PHONE    = os.environ.get('OWNER_PHONE', '')
FAST2SMS_KEY   = os.environ.get('FAST2SMS_KEY', '')


def send_sms_fast2sms(phone: str, message: str) -> bool:
    services.sms_service.FAST2SMS_KEY = FAST2SMS_KEY
    services.sms_service.OWNER_PHONE = OWNER_PHONE
    return services.send_sms_fast2sms(phone, message)


def _send_async(recipient, subject, body):
    services.email_service.send_async(recipient, subject, body)


def send_customer_order_email(order: dict):
    services.email_service.GMAIL_ADDRESS = GMAIL_ADDRESS
    services.email_service.GMAIL_PASSWORD = GMAIL_PASSWORD
    services.send_customer_order_email(order)


def notify_owner_new_order(order: dict):
    services.email_service.GMAIL_ADDRESS = GMAIL_ADDRESS
    services.email_service.GMAIL_PASSWORD = GMAIL_PASSWORD
    services.notify_owner_new_order(order)


def notify_owner_payment(order: dict):
    services.email_service.GMAIL_ADDRESS = GMAIL_ADDRESS
    services.email_service.GMAIL_PASSWORD = GMAIL_PASSWORD
    services.sms_service.FAST2SMS_KEY = FAST2SMS_KEY
    services.sms_service.OWNER_PHONE = OWNER_PHONE
    services.notify_owner_payment(order)



@app.route('/api/place-order', methods=['POST'])
def api_place_order():
    """Place an order. payment_method: 'cash' | 'upi'"""
    data = request.get_json() or {}

    customer_name     = data.get('customer_name', 'Customer').strip()
    customer_phone    = data.get('customer_phone', '').strip()
    customer_email    = data.get('customer_email', '').strip()
    payment_method    = data.get('payment_method', 'cash')   # 'cash' or 'upi'
    total             = float(data.get('total', 0))
    items             = data.get('items', {})          # { "product_name": qty, ... }
    veggie_video      = data.get('veggie_video', False)
    delivery_address  = data.get('delivery_address', '').strip()
    delivery_lat      = data.get('delivery_lat', None)
    delivery_lng      = data.get('delivery_lng', None)

    if not items or total <= 0:
        return jsonify({'success': False, 'message': 'Cart is empty.'}), 400

    order_id = str(uuid.uuid4())
    now      = time.time()

    order = {
        'id'               : order_id,
        'customer_name'    : customer_name,
        'customer_phone'   : customer_phone,
        'customer_email'   : customer_email,
        'payment_method'   : payment_method,
        'total'            : total,
        'items'            : items,
        'veggie_video'     : veggie_video,
        'delivery_address' : delivery_address,
        'delivery_lat'     : delivery_lat,
        'delivery_lng'     : delivery_lng,
        'created_at'       : now,
        # payment_pending → (upi) owner verify → confirmed/rejected
        # cash orders go straight to 'pending' (awaiting packing)
        'payment_status'   : 'pending_verification' if payment_method == 'upi' else 'paid_cash',
        'order_status'     : 'waiting_payment' if payment_method == 'upi' else 'pending',
    }

    orders[order_id] = order
    _save_order(order)   # ← persist immediately
    logger.info(f"Order placed & saved: {order_id} | {payment_method} | ₹{total}")

    # Notify owner about every new order
    notify_owner_new_order(order)
    # Send order confirmation email to customer
    send_customer_order_email(order)
    # For UPI: also send the payment-claim alert
    if payment_method == 'upi':
        notify_owner_payment(order)

    return jsonify({
        'success'        : True,
        'order_id'       : order_id,
        'payment_method' : payment_method,
        'upi_id'         : OWNER_UPI_ID if payment_method == 'upi' else None,
        'message'        : 'Order placed. Awaiting payment verification.' if payment_method == 'upi' else 'Order confirmed!',
    })


@app.route('/api/payment-status/<order_id>', methods=['GET'])
def api_payment_status(order_id):
    """Poll payment/order status — called by frontend while customer waits."""
    order = orders.get(order_id)
    if not order:
        return jsonify({'success': False, 'message': 'Order not found.'}), 404
    return jsonify({
        'success'        : True,
        'order_id'       : order_id,
        'payment_status' : order['payment_status'],
        'order_status'   : order['order_status'],
    })


@app.route('/api/my-orders', methods=['GET'])
def api_my_orders():
    """Return orders for the currently logged-in customer (filtered by phone)."""
    phone = request.args.get('phone', '').strip()
    email = request.args.get('email', '').strip()
    if not phone and not email:
        return jsonify({'success': False, 'message': 'phone or email required'}), 400
    my = [o for o in orders.values()
          if (phone and o.get('customer_phone') == phone)
          or (email and o.get('customer_email') == email)]
    # Sort newest first
    my.sort(key=lambda o: o.get('created_at', 0), reverse=True)
    return jsonify({'success': True, 'orders': my})


@app.route('/api/owner/orders', methods=['GET'])
def api_owner_orders():
    """Return all orders for the owner dashboard."""
    return jsonify({'success': True, 'orders': list(orders.values())})


@app.route('/api/owner/verify-payment', methods=['POST'])
def api_owner_verify_payment():
    """Owner confirms or rejects a UPI payment claim."""
    data     = request.get_json() or {}
    order_id = data.get('order_id', '')
    action   = data.get('action', '')   # 'confirm' or 'reject'

    order = orders.get(order_id)
    if not order:
        return jsonify({'success': False, 'message': 'Order not found.'}), 404

    if action == 'confirm':
        order['payment_status'] = 'paid_upi'
        order['order_status']   = 'pending'
        _save_order(order)   # persist
        # Notify customer via email
        if order.get('customer_email') and GMAIL_ADDRESS and GMAIL_PASSWORD:
            try:
                send_email_gmail(
                    order['customer_email'],
                    '✅ Payment Confirmed — Patel Groceries',
                    f"Hi {order['customer_name']}! Your UPI payment of ₹{order['total']} "
                    f"for Order #{order['id'][:8].upper()} has been confirmed. "
                    f"Your order is now being packed. Thank you!"
                )
            except Exception as exc:
                logger.error(f"Customer confirm email failed: {exc}")
        msg = 'Payment confirmed. Order is now active.'
    elif action == 'reject':
        order['payment_status'] = 'rejected'
        order['order_status']   = 'cancelled'
        _save_order(order)   # persist
        # Notify customer via email
        if order.get('customer_email') and GMAIL_ADDRESS and GMAIL_PASSWORD:
            try:
                send_email_gmail(
                    order['customer_email'],
                    '❌ Payment Not Received — Patel Groceries',
                    f"Hi {order['customer_name']}, we could not verify your UPI payment "
                    f"for Order #{order['id'][:8].upper()} (₹{order['total']}). "
                    f"Please retry or choose Cash on Delivery. Contact support if needed."
                )
            except Exception as exc:
                logger.error(f"Customer reject email failed: {exc}")
        msg = 'Payment rejected. Customer notified.'
    else:
        return jsonify({'success': False, 'message': 'Invalid action.'}), 400

    return jsonify({'success': True, 'message': msg, 'order': order})


@app.route('/api/owner/update-status', methods=['POST'])
def api_owner_update_status():
    """Owner advances an order through the status pipeline."""
    data      = request.get_json() or {}
    order_id  = data.get('order_id', '')
    new_status = data.get('status', '')

    valid_statuses = ('pending', 'packing', 'delivery', 'delivered')
    if new_status not in valid_statuses:
        return jsonify({'success': False, 'message': f'Invalid status: {new_status}'}), 400

    order = orders.get(order_id)
    if not order:
        return jsonify({'success': False, 'message': 'Order not found.'}), 404

    order['order_status'] = new_status
    _save_order(order)   # persist
    logger.info(f"Order {order_id[:8].upper()} status → {new_status}")

    # Email customer on meaningful status changes
    if order.get('customer_email') and GMAIL_ADDRESS and GMAIL_PASSWORD:
        oid  = order_id[:8].upper()
        name = order['customer_name']
        items_line = ', '.join(f"{q}x {n}" for n, q in order.get('items', {}).items())
        if new_status == 'packing':
            _send_async(
                order['customer_email'],
                f'📦 Your Order #{oid} is Being Packed — Patel Groceries',
                f"Hi {name}!\n\nYour order #{oid} is now being packed and will be out for delivery very soon.\n\n"
                f"Items: {items_line}\nTotal: ₹{order['total']}\n\n— Patel Groceries Team"
            )
        elif new_status == 'delivery':
            _send_async(
                order['customer_email'],
                f'🛵 Order #{oid} is Out for Delivery! — Patel Groceries',
                f"Hi {name}!\n\nYour order #{oid} is on its way! 🛵\n"
                f"Please be available to receive it.\n\nTotal: ₹{order['total']}\n\n— Patel Groceries Team"
            )
        elif new_status == 'delivered':
            _send_async(
                order['customer_email'],
                f'✅ Order #{oid} Delivered — Patel Groceries',
                f"Hi {name}!\n\nYour order #{oid} has been delivered successfully. ✅\n"
                f"Thank you for shopping with Patel Groceries! 🙏\n\n"
                f"Total paid: ₹{order['total']}\n\nSee you again soon!\n\n— Patel Groceries Team"
            )

    return jsonify({'success': True, 'message': f'Order moved to {new_status}.', 'order': order})


@app.route('/api/owner/cancel-order', methods=['POST'])
def api_owner_cancel_order():
    """Owner cancels an order."""
    data     = request.get_json() or {}
    order_id = data.get('order_id', '')

    order = orders.get(order_id)
    if not order:
        return jsonify({'success': False, 'message': 'Order not found.'}), 404

    order['order_status']   = 'cancelled'
    order['payment_status'] = 'cancelled'
    _save_order(order)   # persist
    logger.info(f"Order {order_id[:8].upper()} cancelled by owner.")

    # Email customer about cancellation
    if order.get('customer_email') and GMAIL_ADDRESS and GMAIL_PASSWORD:
        oid  = order_id[:8].upper()
        _send_async(
            order['customer_email'],
            f'\u274c Order #{oid} Cancelled \u2014 Patel Groceries',
            f"Hi {order['customer_name']},\n\nWe regret to inform you that your order #{oid} "
            f"(\u20b9{order['total']}) has been cancelled by the store.\n\n"
            f"If you have any questions, please contact us directly.\n\n"
            f"We apologise for the inconvenience.\n\n\u2014 Patel Groceries Team"
        )

    return jsonify({'success': True, 'message': 'Order cancelled. Customer notified.'})


@app.route('/api/owner/register', methods=['POST'])
def api_owner_register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    name = data.get('name', '').strip() or 'Owner Admin'
    email = data.get('email', '').strip() or 'owner@patelgroceries.com'
    phone = data.get('phone', '').strip() or '+91 0000000000'

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and Password are required.'}), 400

    import hashlib, time
    hashed_pass = hashlib.sha256(password.encode('utf-8')).hexdigest()

    try:
        with _get_db() as conn:
            row = conn.execute('SELECT 1 FROM owners WHERE username = ?', (username,)).fetchone()
            if row:
                return jsonify({'success': False, 'message': 'Username is already taken.'}), 400

            conn.execute(
                'INSERT INTO owners (username, password, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                (username, hashed_pass, name, email, phone, time.time())
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Owner registration error: {str(e)}")
        return jsonify({'success': False, 'message': 'Database error occurred.'}), 500

    return jsonify({'success': True, 'message': 'Owner registered successfully.'})


@app.route('/api/owner/login', methods=['POST'])
def api_owner_login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and Password are required.'}), 400

    import hashlib
    hashed_pass = hashlib.sha256(password.encode('utf-8')).hexdigest()

    try:
        with _get_db() as conn:
            row = conn.execute(
                'SELECT name, email, phone FROM owners WHERE username = ? AND password = ?',
                (username, hashed_pass)
            ).fetchone()
            if not row:
                return jsonify({'success': False, 'message': 'Invalid username or password.'}), 401
            
            owner_info = {
                'name': row[0],
                'email': row[1],
                'phone': row[2]
            }
    except Exception as e:
        logger.error(f"Owner login error: {str(e)}")
        return jsonify({'success': False, 'message': 'Database error occurred.'}), 500

    return jsonify({'success': True, 'message': 'Login successful.', 'owner': owner_info})


@app.route('/api/owner/forgot-password-send', methods=['POST'])
def api_owner_forgot_password_send():
    data = request.get_json() or {}
    username = data.get('username', '').strip()

    if not username:
        return jsonify({'success': False, 'message': 'Username is required.'}), 400

    try:
        with _get_db() as conn:
            row = conn.execute(
                'SELECT email, name FROM owners WHERE username = ?',
                (username,)
            ).fetchone()
            if not row:
                return jsonify({'success': False, 'message': 'Username not found.'}), 404
            
            email = row[0]
            name = row[1]
    except Exception as e:
        logger.error(f"Owner forgot password database query error: {str(e)}")
        return jsonify({'success': False, 'message': 'Database error occurred.'}), 500

    if not email:
        return jsonify({'success': False, 'message': 'Owner email not configured. Please contact support.'}), 400

    otp_code = f"{random.randint(100000, 999999)}"
    session['owner_reset_otp'] = otp_code
    session['owner_reset_username'] = username

    if not GMAIL_ADDRESS or not GMAIL_PASSWORD:
        logger.error("Gmail credentials not configured on the server.")
        return jsonify({'success': False, 'message': 'Email configuration is missing on the server.'}), 500

    try:
        logger.info(f"\nSENDING OWNER PASSWORD RESET OTP")
        logger.info(f"To: {email}")
        logger.info(f"OTP Code: {otp_code}")
        body = (
            f"Dear {name},\n\n"
            f"Your Patel Groceries owner password reset one-time password (OTP) is: {otp_code}\n\n"
            f"If you did not request this, please secure your account credentials immediately.\n\n"
            f"Thank you!"
        )
        send_email_gmail(email, 'Owner Password Reset Code', body)
    except Exception as exc:
        logger.error(f"Error sending owner reset OTP: {str(exc)}")
        return jsonify({'success': False, 'message': f'Unable to send reset email: {str(exc)}'}), 500

    return jsonify({'success': True, 'message': 'Password reset verification code sent to your registered email.'})


@app.route('/api/owner/reset-password', methods=['POST'])
def api_owner_reset_password():
    data = request.get_json() or {}
    otp = data.get('otp', '').strip()
    new_password = data.get('password', '').strip()

    stored_otp = session.get('owner_reset_otp')
    username = session.get('owner_reset_username')

    if not stored_otp or not username:
        return jsonify({'success': False, 'message': 'No password reset request found. Please try again.'}), 400

    if otp != stored_otp:
        return jsonify({'success': False, 'message': 'Incorrect OTP code.'}), 400

    if not new_password:
        return jsonify({'success': False, 'message': 'New password is required.'}), 400

    import hashlib
    hashed_pass = hashlib.sha256(new_password.encode('utf-8')).hexdigest()

    try:
        with _get_db() as conn:
            conn.execute(
                'UPDATE owners SET password = ? WHERE username = ?',
                (hashed_pass, username)
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Owner password update database error: {str(e)}")
        return jsonify({'success': False, 'message': 'Database error occurred.'}), 500

    session.pop('owner_reset_otp', None)
    session.pop('owner_reset_username', None)

    return jsonify({'success': True, 'message': 'Password reset successfully. Please login with your new password.'})



@app.route('/api/config/upi', methods=['GET'])
def api_upi_config():
    """Return UPI ID for QR generation — safe to expose to authenticated users."""
    return jsonify({'upi_id': OWNER_UPI_ID, 'name': 'Patel Groceries'})


@app.route('/api/customer/save-profile', methods=['POST'])
def api_save_customer_profile():
    """Save/update customer profile and addresses to SQLite."""
    data = request.get_json() or {}
    phone     = data.get('phone', '').strip()
    email     = data.get('email', '').strip()
    name      = data.get('name', '').strip()
    addresses = data.get('addresses', [])
    khata_bal = float(data.get('khata_bal', 0))
    if not phone:
        return jsonify({'success': False, 'message': 'phone required'}), 400
    _save_customer(phone, email, name, addresses, khata_bal)
    return jsonify({'success': True})


@app.route('/api/customer/load-profile', methods=['GET'])
def api_load_customer_profile():
    """Load a customer\'s saved profile from SQLite."""
    phone = request.args.get('phone', '').strip()
    if not phone:
        return jsonify({'success': False, 'message': 'phone required'}), 400
    profile = _load_customer(phone)
    if not profile:
        return jsonify({'success': False, 'message': 'not found'})
    return jsonify({'success': True, **profile})


@app.route('/api/owner/clear-old-orders', methods=['POST'])
def api_clear_old_orders():
    """Delete orders older than N days (default 30). Owner only."""
    data = request.get_json() or {}
    days = int(data.get('days', 30))
    cutoff = time.time() - days * 86400
    to_delete = [oid for oid, o in orders.items() if o.get('created_at', 0) < cutoff]
    for oid in to_delete:
        orders.pop(oid, None)
        _delete_order(oid)
    return jsonify({'success': True, 'deleted': len(to_delete),
                    'message': f'Removed {len(to_delete)} orders older than {days} days.'})


@app.route('/api/inventory/overrides', methods=['GET'])
def api_inventory_overrides():
    """Return list of all inventory stock/price overrides."""
    try:
        overrides = db_utils.load_inventory_overrides()
        return jsonify({'success': True, 'overrides': overrides})
    except Exception as e:
        logger.error(f"Error loading inventory overrides: {e}")
        return jsonify({'success': False, 'message': 'Database error'}), 500


@app.route('/api/owner/update-inventory', methods=['POST'])
def api_owner_update_inventory():
    """Create or update a product's stock status or price override."""
    data = request.get_json() or {}
    product_id = data.get('product_id')
    in_stock = data.get('in_stock')  # 0 or 1
    price = data.get('price')  # Optional float

    if product_id is None or in_stock is None:
        return jsonify({'success': False, 'message': 'product_id and in_stock are required'}), 400

    try:
        db_utils.save_inventory_override(int(product_id), int(in_stock), float(price) if price is not None else None)
        return jsonify({'success': True, 'message': 'Inventory override saved successfully'})
    except Exception as e:
        logger.error(f"Error saving inventory override: {e}")
        return jsonify({'success': False, 'message': 'Database error'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')

