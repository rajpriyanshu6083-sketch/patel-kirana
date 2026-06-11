import os
import smtplib
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Gmail SMTP Configuration
GMAIL_ADDRESS = os.environ.get('GMAIL_ADDRESS')
GMAIL_PASSWORD = os.environ.get('GMAIL_PASSWORD')

def send_email_gmail(recipient: str, subject: str, body: str) -> bool:
    """Send email using Gmail SMTP"""
    logger.debug(f"Starting email send to {recipient}")
    
    # Reload from env in case they are updated dynamically
    gmail_addr = os.environ.get('GMAIL_ADDRESS') or GMAIL_ADDRESS
    gmail_pwd = os.environ.get('GMAIL_PASSWORD') or GMAIL_PASSWORD

    if not gmail_addr or not gmail_pwd:
        raise RuntimeError(
            'Gmail credentials not configured.\n'
            'Set environment variables:\n'
            '  GMAIL_ADDRESS=your-email@gmail.com\n'
            '  GMAIL_PASSWORD=your-app-specific-password\n\n'
            'Note: Use an app-specific password from myaccount.google.com/apppasswords'
        )
    
    try:
        logger.debug(f"Creating MIME message for {recipient}")
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = gmail_addr
        message['To'] = recipient
        
        part = MIMEText(body, 'plain')
        message.attach(part)
        
        logger.debug(f"Connecting to Gmail SMTP...")
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=5) as server:
            logger.debug(f"Logging in to Gmail...")
            server.login(gmail_addr, gmail_pwd)
            logger.debug(f"Sending email...")
            server.sendmail(gmail_addr, recipient, message.as_string())
        
        logger.info(f"Email sent successfully to {recipient}")
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"Gmail authentication failed: {str(e)}")
        raise RuntimeError(
            'Gmail authentication failed. Please check:\n'
            '1. Email address is correct\n'
            '2. App-specific password is used (not your Gmail password)\n'
            '3. 2-Factor Authentication is enabled on your Gmail\n'
            'Get app password at: myaccount.google.com/apppasswords'
        )
    except smtplib.SMTPException as e:
        logger.error(f"SMTP error: {str(e)}")
        raise RuntimeError(f'SMTP error: {str(e)}')
    except Exception as e:
        logger.error(f"Email sending failed: {str(e)}")
        raise RuntimeError(f'Email sending failed: {str(e)}')

def compose_otp_email(name: str, otp_code: str) -> str:
    return (
        f"Dear {name},\n\n"
        f"Your Patel Groceries one-time password is: {otp_code}\n\n"
        "Use this code to complete your login. This OTP is valid for 10 minutes.\n\n"
        "If you did not request this code, please ignore this message.\n\n"
        "Thank you for using Patel Groceries!"
    )

def send_async(recipient, subject, body):
    """Fire-and-forget email in a background thread."""
    def _run():
        try:
            send_email_gmail(recipient, subject, body)
        except Exception as exc:
            logger.error(f"Async email failed: {exc}")
    threading.Thread(target=_run, daemon=True).start()

def send_customer_order_email(order: dict):
    """Send order confirmation to the customer."""
    gmail_addr = os.environ.get('GMAIL_ADDRESS') or GMAIL_ADDRESS
    gmail_pwd = os.environ.get('GMAIL_PASSWORD') or GMAIL_PASSWORD
    if not order.get('customer_email') or not gmail_addr or not gmail_pwd:
        return
    oid   = order['id'][:8].upper()
    name  = order['customer_name']
    total = order['total']
    items_str = '\n'.join(f"  • {qty}x {item}" for item, qty in order.get('items', {}).items())
    method = order['payment_method']

    if method == 'upi':
        pay_line = f"Payment Method : UPI (pending owner verification)"
        note     = "We will confirm once we verify your payment. You will receive another email shortly."
    elif method == 'khata':
        pay_line = f"Payment Method : Digital Ledger (Khata) — Pay later"
        note     = "This amount has been added to your Patel Groceries Digital Ledger."
    else:
        pay_line = f"Payment Method : Cash on Delivery"
        note     = f"Please keep ₹{total} ready at the time of delivery."

    subject = f"🛍️ Order Confirmed #{oid} — Patel Groceries"
    body = (
        f"Dear {name},\n\n"
        f"Thank you for shopping with Patel Groceries! 🙏\n"
        f"Your order has been placed successfully.\n\n"
        f"{'─'*40}\n"
        f"ORDER SUMMARY\n"
        f"{'─'*40}\n"
        f"Order ID       : #{oid}\n"
        f"Items Ordered  :\n{items_str}\n"
        f"Order Total    : ₹{total}\n"
        f"{pay_line}\n"
        f"{'─'*40}\n\n"
        f"{note}\n\n"
        f"Track your order any time from the My Orders section in the app.\n\n"
        f"— Patel Groceries Team"
    )
    send_async(order['customer_email'], subject, body)

def notify_owner_new_order(order: dict):
    """Notify owner about every new order (cash, upi, khata)."""
    gmail_addr = os.environ.get('GMAIL_ADDRESS') or GMAIL_ADDRESS
    gmail_pwd = os.environ.get('GMAIL_PASSWORD') or GMAIL_PASSWORD
    if not gmail_addr or not gmail_pwd:
        return
    oid       = order['id'][:8].upper()
    items_str = ', '.join(f"{v}x {k}" for k, v in order.get('items', {}).items())
    method    = order['payment_method'].upper()
    subject   = f"🛒 New Order #{oid} [{method}] — Patel Groceries"
    addr_line = order.get('delivery_address', '')
    maps_link = ''
    if order.get('delivery_lat') and order.get('delivery_lng'):
        maps_link = f"\nGoogle Maps : https://maps.google.com/?q={order['delivery_lat']},{order['delivery_lng']}"
    elif addr_line:
        import urllib.parse
        maps_link = f"\nGoogle Maps : https://maps.google.com/maps/search/?api=1&query={urllib.parse.quote(addr_line)}"
    body = (
        f"New order received on Patel Groceries!\n\n"
        f"Order ID  : #{oid}\n"
        f"Customer  : {order['customer_name']} ({order['customer_phone']})\n"
        f"Email     : {order['customer_email']}\n"
        f"Address   : {addr_line or 'Not provided'}{maps_link}\n"
        f"Amount    : ₹{order['total']}\n"
        f"Payment   : {method}\n"
        f"Items     : {items_str}\n\n"
        f"{'👉 Open the Owner Dashboard → Orders tab to process this order.' if method != 'UPI' else '👉 Open Orders tab to VERIFY the UPI payment.'}\n\n"
        f"— Patel Groceries System"
    )
    send_async(gmail_addr, subject, body)


def notify_owner_payment(order: dict):
    """Notify owner about a new UPI payment claim via email + SMS."""
    gmail_addr = os.environ.get('GMAIL_ADDRESS') or GMAIL_ADDRESS
    gmail_pwd = os.environ.get('GMAIL_PASSWORD') or GMAIL_PASSWORD
    items_str = ', '.join(f"{v}x {k}" for k, v in order.get('items', {}).items())
    subject = f"💸 UPI Payment Claimed — Order #{order['id'][:8].upper()}"
    body = (
        f"New UPI payment claimed on Patel Groceries!\n\n"
        f"Order ID  : {order['id'][:8].upper()}\n"
        f"Customer  : {order['customer_name']} ({order['customer_phone']})\n"
        f"Amount    : ₹{order['total']}\n"
        f"Items     : {items_str}\n\n"
        f"👉 Open the Owner Dashboard → Orders tab to verify or REJECT.\n"
        f"The customer is waiting for confirmation.\n\n"
        f"— Patel Groceries System"
    )
    if gmail_addr and gmail_pwd:
        try:
            send_email_gmail(gmail_addr, subject, body)
        except Exception as exc:
            logger.error(f"Owner email notification failed: {exc}")

    # Send SMS notification
    from services.sms_service import send_sms_fast2sms, OWNER_PHONE
    sms_msg = (
        f"Patel Groceries: UPI ₹{order['total']} claimed by {order['customer_name']} "
        f"Order#{order['id'][:6].upper()}. Open dashboard to verify."
    )
    send_sms_fast2sms(OWNER_PHONE, sms_msg)

