import os
import sqlite3
import json
import uuid
import time
import logging
from pathlib import Path
from contextlib import contextmanager

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

if os.path.exists('/app/data'):
    DB_PATH = Path('/app/data/patel_data.db')
else:
    DB_PATH = Path(__file__).parent / 'patel_data.db'

@contextmanager
def get_db():
    """Open a thread-local SQLite connection with WAL mode for concurrency, ensuring it is closed."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        with conn:
            yield conn
    finally:
        conn.close()

def init_db():
    """Create tables if they don't exist and log status."""
    with get_db() as conn:
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
            CREATE TABLE IF NOT EXISTS support_tickets (
                id            TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_email TEXT,
                issue         TEXT NOT NULL,
                category      TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'pending',
                created_at    REAL NOT NULL
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
            import hashlib
            hashed = hashlib.sha256('admin'.encode()).hexdigest()
            conn.execute(
                "INSERT INTO owners (username, password, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ('admin', hashed, 'Owner Admin', 'owner@patelgroceries.com', '+91 0000000000', time.time())
            )
        conn.commit()
    logger.info(f"DB initialised at {DB_PATH}")

def load_all_orders():
    """Populate and return the orders dict from SQLite."""
    with get_db() as conn:
        rows = conn.execute('SELECT id, data FROM orders').fetchall()
    return {row[0]: json.loads(row[1]) for row in rows}

def save_order(order: dict):
    """Upsert a single order into SQLite (called after every mutation)."""
    with get_db() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO orders (id, data, created_at) VALUES (?, ?, ?)',
            (order['id'], json.dumps(order), order.get('created_at', time.time()))
        )
        conn.commit()

def delete_order(order_id: str):
    """Permanently remove an order from SQLite."""
    with get_db() as conn:
        conn.execute('DELETE FROM orders WHERE id = ?', (order_id,))
        conn.commit()

def save_customer(phone: str, email: str, name: str, addresses: list, khata_bal: float):
    """Upsert customer profile data (called on login / address / khata change)."""
    with get_db() as conn:
        conn.execute(
            '''INSERT INTO customers (phone, email, name, addresses, khata_bal, first_seen)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(phone) DO UPDATE SET
                   email=excluded.email, name=excluded.name,
                   addresses=excluded.addresses, khata_bal=excluded.khata_bal''',
            (phone, email, name, json.dumps(addresses), khata_bal, time.time())
        )
        conn.commit()

def load_customer(phone: str):
    """Return saved customer data or None."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT email, name, addresses, khata_bal FROM customers WHERE phone = ?',
            (phone,)
        ).fetchone()
    if not row:
        return None
    return {
        'email': row[0],
        'name': row[1],
        'addresses': json.loads(row[2] or '[]'),
        'khata_bal': row[3] or 0
    }

def save_inventory_override(product_id: int, in_stock: int, price: float = None):
    """Upsert stock status and price override details for a product."""
    with get_db() as conn:
        conn.execute(
            '''INSERT INTO inventory_overrides (product_id, in_stock, price, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(product_id) DO UPDATE SET
                   in_stock=excluded.in_stock, price=excluded.price, updated_at=excluded.updated_at''',
            (product_id, in_stock, price, time.time())
        )
        conn.commit()

def load_inventory_overrides() -> list:
    """Return list of all inventory overrides."""
    with get_db() as conn:
        rows = conn.execute('SELECT product_id, in_stock, price FROM inventory_overrides').fetchall()
    return [{'product_id': r[0], 'in_stock': r[1], 'price': r[2]} for r in rows]

def save_support_ticket(ticket_id: str, customer_name: str, customer_phone: str, customer_email: str, issue: str, category: str, status: str = 'pending', created_at: float = None):
    """Upsert support ticket status and details."""
    if created_at is None:
        created_at = time.time()
    with get_db() as conn:
        conn.execute(
            '''INSERT OR REPLACE INTO support_tickets (id, customer_name, customer_phone, customer_email, issue, category, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (ticket_id, customer_name, customer_phone, customer_email, issue, category, status, created_at)
        )
        conn.commit()

def load_all_support_tickets() -> list:
    """Return list of all support tickets ordered by created_at DESC."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT id, customer_name, customer_phone, customer_email, issue, category, status, created_at FROM support_tickets ORDER BY created_at DESC'
        ).fetchall()
    return [{
        'id': r[0],
        'customer_name': r[1],
        'customer_phone': r[2],
        'customer_email': r[3],
        'issue': r[4],
        'category': r[5],
        'status': r[6],
        'created_at': r[7]
    } for r in rows]

def resolve_support_ticket(ticket_id: str):
    """Mark a support ticket as resolved."""
    with get_db() as conn:
        conn.execute("UPDATE support_tickets SET status = 'resolved' WHERE id = ?", (ticket_id,))
        conn.commit()
