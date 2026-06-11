import os
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Fast2SMS Configuration
OWNER_PHONE = os.environ.get('OWNER_PHONE', '')
FAST2SMS_KEY = os.environ.get('FAST2SMS_KEY', '')

def send_sms_fast2sms(phone: str, message: str) -> bool:
    """Send SMS via Fast2SMS DLT-free route (free tier, India only)."""
    # Reload in case env changes dynamically (e.g. during testing)
    sms_key = os.environ.get('FAST2SMS_KEY') or FAST2SMS_KEY
    target_phone = phone or os.environ.get('OWNER_PHONE') or OWNER_PHONE

    if not sms_key or not target_phone:
        logger.warning("Fast2SMS key or phone not configured — SMS skipped.")
        return False
    try:
        import urllib.request, urllib.parse, json as _json
        payload = urllib.parse.urlencode({
            'route': 'q',
            'message': message,
            'language': 'english',
            'flash': 0,
            'numbers': target_phone,
        }).encode()
        req = urllib.request.Request(
            'https://www.fast2sms.com/dev/bulkV2',
            data=payload,
            headers={'authorization': sms_key, 'Content-Type': 'application/x-www-form-urlencoded'},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = _json.loads(resp.read())
            if result.get('return'):
                logger.info(f"SMS sent to {target_phone}: {result}")
                return True
            else:
                logger.error(f"Fast2SMS error: {result}")
                return False
    except Exception as exc:
        logger.error(f"SMS send failed: {exc}")
        return False
