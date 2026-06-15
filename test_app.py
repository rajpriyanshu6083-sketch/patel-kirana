import unittest
from unittest.mock import patch
import json
from pathlib import Path
import app as app_module
from app import app, GMAIL_ADDRESS, GMAIL_PASSWORD
import db_utils

class PatelKiranaTestCase(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        self.client = app.test_client()

        # Isolate DB for tests
        self.original_db_path = app_module.DB_PATH
        self.original_db_utils_path = db_utils.DB_PATH
        
        test_db = Path(__file__).parent / 'patel_data_test.db'
        app_module.DB_PATH = test_db
        db_utils.DB_PATH = test_db

        # Register cleanup to run under all conditions (success or setUp/test failure)
        def cleanup():
            # Restore paths
            app_module.DB_PATH = self.original_db_path
            db_utils.DB_PATH = self.original_db_utils_path
            app_module._reload_orders_from_db()

            # Delete test DB and temporary WAL/SHM files
            for suffix in ['', '-shm', '-wal']:
                db_file = Path(str(test_db) + suffix)
                if db_file.exists():
                    try:
                        db_file.unlink()
                    except Exception:
                        pass
        self.addCleanup(cleanup)

        # Initialize the isolated test DB
        app_module._init_db()

    def test_home_page(self):
        """Test that the homepage loads successfully"""
        with self.client.get('/') as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn(b'PATEL GROCERIES', response.data)

    def test_service_worker(self):
        """Test that the service worker is served correctly"""
        with self.client.get('/sw.js') as response:
            self.assertEqual(response.status_code, 200)
            self.assertIn(response.mimetype, ['application/javascript', 'text/javascript'])

    def test_api_test_endpoint(self):
        """Test the configuration api endpoint"""
        with self.client.get('/api/test') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('gmail_address', data)
            self.assertIn('gmail_password_length', data)

    def test_network_info(self):
        """Test network info endpoint returns IP, port, and URL"""
        with self.client.get('/api/network-info') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('ip', data)
            self.assertIn('port', data)
            self.assertIn('url', data)

    def test_upi_config(self):
        """Test UPI configuration endpoint returns Owner UPI details"""
        with self.client.get('/api/config/upi') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertIn('upi_id', data)
            self.assertIn('name', data)

    def test_send_otp_missing_params(self):
        """Test send-otp endpoint returns 400 with missing params"""
        with self.client.post('/api/send-otp', 
                                    data=json.dumps({}),
                                    content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])

    def test_send_otp_invalid_email(self):
        """Test send-otp endpoint returns 400 for invalid email formats"""
        payload = {
            "name": "Test User",
            "email": "invalid-email",
            "phone": "9876543210"
        }
        with self.client.post('/api/send-otp', 
                                    data=json.dumps(payload),
                                    content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('valid email address', data['message'])

    def test_send_otp_invalid_phone(self):
        """Test send-otp endpoint returns 400 for non-10-digit phone number"""
        payload = {
            "name": "Test User",
            "email": "test@gmail.com",
            "phone": "12345"
        }
        with self.client.post('/api/send-otp', 
                                    data=json.dumps(payload),
                                    content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('valid 10-digit phone number', data['message'])

    @patch('app.send_email_gmail')
    def test_send_otp_success_flow(self, mock_send_email):
        """Test successful send-otp and verify-otp session flow"""
        mock_send_email.return_value = True
        
        # Override Gmail check if credentials are empty to bypass 500 error in test environment
        with patch('app.GMAIL_ADDRESS', 'test@gmail.com'), \
             patch('app.GMAIL_PASSWORD', 'password'):
            
            payload = {
                "name": "Test User",
                "email": "test@gmail.com",
                "phone": "9876543210"
            }
            
            # Send OTP
            with self.client.post('/api/send-otp', 
                                       data=json.dumps(payload),
                                       content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                self.assertTrue(data['success'])
            
            # Since mock returned success, check session values
            with self.client.session_transaction() as sess:
                otp_code = sess.get('otp_code')
                self.assertIsNotNone(otp_code)
                self.assertEqual(sess.get('otp_email'), 'test@gmail.com')
            
            # Verify OTP with incorrect code
            verify_payload = {"otp": "000000"}
            with self.client.post('/api/verify-otp',
                                       data=json.dumps(verify_payload),
                                       content_type='application/json') as response:
                self.assertEqual(response.status_code, 400)
            
            # Verify OTP with correct code
            verify_payload = {"otp": otp_code}
            with self.client.post('/api/verify-otp',
                                       data=json.dumps(verify_payload),
                                       content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
            
            # Session OTP code should be cleared after verification
            with self.client.session_transaction() as sess:
                self.assertIsNone(sess.get('otp_code'))

    def test_verify_otp_no_session(self):
        """Test verify-otp endpoint returns 400 when no OTP has been requested"""
        with self.client.post('/api/verify-otp',
                                   data=json.dumps({"otp": "123456"}),
                                   content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('No OTP request was found', data['message'])

    def test_customer_profile_save_and_load(self):
        """Test saving and loading customer profile details"""
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "9876543210"

        profile_data = {
            "phone": "9876543210",
            "email": "customer@gmail.com",
            "name": "Patel Customer",
            "addresses": ["123 Lane", "456 Street"],
            "khata_bal": 150.0
        }
        with self.client.post('/api/customer/save-profile',
                              data=json.dumps(profile_data),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])

        # Load profile
        with self.client.get('/api/customer/load-profile?phone=9876543210') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['name'], "Patel Customer")
            self.assertEqual(data['email'], "customer@gmail.com")
            self.assertEqual(data['addresses'], ["123 Lane", "456 Street"])
            self.assertEqual(data['khata_bal'], 150.0)

        # Load non-existent profile
        with self.client.get('/api/customer/load-profile?phone=0000000000') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('not found', data['message'])

        # Missing phone parameter
        with self.client.get('/api/customer/load-profile') as response:
            self.assertEqual(response.status_code, 400)

    @patch('app.send_email_gmail')
    @patch('app.send_sms_fast2sms')
    def test_place_order_and_management_flows(self, mock_send_sms, mock_send_email):
        """Test placing orders, polling status, and owner status updates/cancellations"""
        mock_send_email.return_value = True
        mock_send_sms.return_value = True

        # Place COD order
        order_payload_cod = {
            "customer_name": "John Doe",
            "customer_phone": "9876543210",
            "customer_email": "john@gmail.com",
            "payment_method": "cash",
            "total": 500.0,
            "items": {"Milk": 2, "Bread": 1},
            "delivery_address": "123 Green Street"
        }
        with self.client.post('/api/place-order',
                              data=json.dumps(order_payload_cod),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertIsNotNone(data['order_id'])
            order_id_cod = data['order_id']

        # Place UPI order
        order_payload_upi = {
            "customer_name": "Jane Doe",
            "customer_phone": "9876543211",
            "customer_email": "jane@gmail.com",
            "payment_method": "upi",
            "total": 350.0,
            "items": {"Apples": 5},
            "delivery_address": "456 Blue Avenue"
        }
        with self.client.post('/api/place-order',
                              data=json.dumps(order_payload_upi),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertIsNotNone(data['order_id'])
            order_id_upi = data['order_id']

        # Get status of placed order
        with self.client.get(f'/api/payment-status/{order_id_cod}') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['payment_status'], 'paid_cash')
            self.assertEqual(data['order_status'], 'pending')

        # Get status of non-existent order
        with self.client.get('/api/payment-status/invalid_order_id') as response:
            self.assertEqual(response.status_code, 404)

        # Get my-orders by phone
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "9876543210"

        with self.client.get('/api/my-orders?phone=9876543210') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertTrue(len(data['orders']) >= 1)

        # Get owner orders
        with self.client.session_transaction() as sess:
            sess['is_owner'] = True

        with self.client.get('/api/owner/orders') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertTrue(len(data['orders']) >= 2)

        # Owner verify UPI payment (confirm)
        verify_payload_confirm = {
            "order_id": order_id_upi,
            "action": "confirm"
        }
        with self.client.post('/api/owner/verify-payment',
                              data=json.dumps(verify_payload_confirm),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['order']['payment_status'], 'paid_upi')
            self.assertEqual(data['order']['order_status'], 'pending')

        # Owner verify UPI payment (reject) on a new UPI order
        with self.client.post('/api/place-order',
                              data=json.dumps(order_payload_upi),
                              content_type='application/json') as response:
            order_id_upi_reject = json.loads(response.data)['order_id']

        verify_payload_reject = {
            "order_id": order_id_upi_reject,
            "action": "reject"
        }
        with self.client.post('/api/owner/verify-payment',
                              data=json.dumps(verify_payload_reject),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['order']['payment_status'], 'rejected')
            self.assertEqual(data['order']['order_status'], 'cancelled')

        # Owner update status (pending -> packing -> delivery -> delivered)
        with self.client.post('/api/owner/update-status',
                              data=json.dumps({"order_id": order_id_cod, "status": "packing"}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['order']['order_status'], 'packing')

        with self.client.post('/api/owner/update-status',
                              data=json.dumps({"order_id": order_id_cod, "status": "delivery"}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(json.loads(response.data)['order']['order_status'], 'delivery')

        with self.client.post('/api/owner/update-status',
                              data=json.dumps({"order_id": order_id_cod, "status": "delivered"}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(json.loads(response.data)['order']['order_status'], 'delivered')

        # Owner cancel order
        with self.client.post('/api/owner/cancel-order',
                              data=json.dumps({"order_id": order_id_upi}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            self.assertTrue(json.loads(response.data)['success'])

    def test_owner_registration_and_login(self):
        """Test owner registration and login API flows"""
        # Register a new owner
        reg_payload = {
            "username": "testowner",
            "password": "testpassword",
            "name": "Test Owner",
            "email": "testowner@patelgroceries.com",
            "phone": "+91 9999999999"
        }
        with self.client.post('/api/owner/register',
                              data=json.dumps(reg_payload),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['message'], 'Owner registered successfully.')

        # Attempt to register the same username again (should fail)
        with self.client.post('/api/owner/register',
                              data=json.dumps(reg_payload),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('already taken', data['message'])

        # Attempt login with correct credentials
        login_payload = {
            "username": "testowner",
            "password": "testpassword"
        }
        with self.client.post('/api/owner/login',
                              data=json.dumps(login_payload),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['owner']['name'], 'Test Owner')
            self.assertEqual(data['owner']['email'], 'testowner@patelgroceries.com')
            self.assertEqual(data['owner']['phone'], '+91 9999999999')

        # Attempt login with incorrect password
        bad_login_payload = {
            "username": "testowner",
            "password": "wrongpassword"
        }
        with self.client.post('/api/owner/login',
                              data=json.dumps(bad_login_payload),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 401)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('Invalid username or password', data['message'])

    @patch('app.send_email_gmail')
    def test_customer_otp_validation_flows(self, mock_send_email):
        """Test customer OTP send validations under login and register modes"""
        mock_send_email.return_value = True

        with patch('app.GMAIL_ADDRESS', 'test@gmail.com'), \
             patch('app.GMAIL_PASSWORD', 'password'):
            
            # 1. Login action for non-existent profile (should fail 404)
            login_nonexistent = {
                "phone": "9999999999",
                "action": "login"
            }
            with self.client.post('/api/send-otp',
                                  data=json.dumps(login_nonexistent),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 404)
                data = json.loads(response.data)
                self.assertFalse(data['success'])
                self.assertIn('Account not found', data['message'])

            # 2. Register action for non-existent profile (should succeed 200)
            register_payload = {
                "phone": "9999999999",
                "name": "New Customer",
                "email": "newcustomer@gmail.com",
                "action": "register"
            }
            with self.client.post('/api/send-otp',
                                  data=json.dumps(register_payload),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                self.assertTrue(data['success'])

            # Verify OTP to complete customer registration
            with self.client.session_transaction() as sess:
                otp_code = sess.get('otp_code')
            
            verify_payload = {"otp": otp_code}
            with self.client.post('/api/verify-otp',
                                  data=json.dumps(verify_payload),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                self.assertTrue(data['success'])
                self.assertEqual(data['phone'], '9999999999')

            # Save profile to SQLite to persist customer registration
            profile_data = {
                "phone": "9999999999",
                "email": "newcustomer@gmail.com",
                "name": "New Customer",
                "addresses": [],
                "khata_bal": 0.0
            }
            with self.client.post('/api/customer/save-profile',
                                  data=json.dumps(profile_data),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)

            # 3. Register action for already registered phone (should fail 400)
            register_existing = {
                "phone": "9999999999",
                "name": "New Customer",
                "email": "newcustomer@gmail.com",
                "action": "register"
            }
            with self.client.post('/api/send-otp',
                                  data=json.dumps(register_existing),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 400)
                data = json.loads(response.data)
                self.assertFalse(data['success'])
                self.assertIn('already registered', data['message'])

            # 4. Login action for registered phone (should succeed 200)
            login_existing = {
                "phone": "9999999999",
                "action": "login"
            }
            with self.client.post('/api/send-otp',
                                  data=json.dumps(login_existing),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                self.assertTrue(data['success'])

    @patch('app.send_email_gmail')
    def test_owner_forgot_password_reset_flow(self, mock_send_email):
        """Test owner forgot password request and verification reset flow"""
        mock_send_email.return_value = True

        with patch('app.GMAIL_ADDRESS', 'test@gmail.com'), \
             patch('app.GMAIL_PASSWORD', 'password'):

            # 1. Register a test owner first
            reg_payload = {
                "username": "forgotowner",
                "password": "oldpassword",
                "name": "Forgot Owner",
                "email": "forgotowner@gmail.com",
                "phone": "+91 9876543210"
            }
            with self.client.post('/api/owner/register',
                                  data=json.dumps(reg_payload),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)

            # 2. Trigger forgot password for non-existent username (should fail 404)
            with self.client.post('/api/owner/forgot-password-send',
                                  data=json.dumps({"username": "noowner"}),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 404)

            # 3. Trigger forgot password for registered owner (should succeed 200)
            with self.client.post('/api/owner/forgot-password-send',
                                  data=json.dumps({"username": "forgotowner"}),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)
                data = json.loads(response.data)
                self.assertTrue(data['success'])

            # 4. Check session reset OTP
            with self.client.session_transaction() as sess:
                reset_otp = sess.get('owner_reset_otp')
                self.assertIsNotNone(reset_otp)

            # 5. Reset password with incorrect OTP code (should fail 400)
            reset_bad_otp = {
                "otp": "000000",
                "password": "newpassword"
            }
            with self.client.post('/api/owner/reset-password',
                                  data=json.dumps(reset_bad_otp),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 400)

            # 6. Reset password with correct OTP code (should succeed 200)
            reset_good_otp = {
                "otp": reset_otp,
                "password": "newpassword"
            }
            with self.client.post('/api/owner/reset-password',
                                  data=json.dumps(reset_good_otp),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)

            # 7. Attempt login with old password (should fail 401)
            old_login = {
                "username": "forgotowner",
                "password": "oldpassword"
            }
            with self.client.post('/api/owner/login',
                                  data=json.dumps(old_login),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 401)

            # 8. Attempt login with new password (should succeed 200)
            new_login = {
                "username": "forgotowner",
                "password": "newpassword"
            }
            with self.client.post('/api/owner/login',
                                  data=json.dumps(new_login),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 200)

    @patch('app.send_email_gmail')
    def test_send_otp_missing_credentials(self, mock_send_email):
        """Test send-otp endpoint returns 500 when Gmail credentials are not configured"""
        with patch('app.GMAIL_ADDRESS', ''), \
             patch('app.GMAIL_PASSWORD', ''):
            payload = {
                "name": "Test User",
                "email": "test@gmail.com",
                "phone": "9876543210"
            }
            with self.client.post('/api/send-otp',
                                  data=json.dumps(payload),
                                  content_type='application/json') as response:
                self.assertEqual(response.status_code, 500)
                data = json.loads(response.data)
                self.assertFalse(data['success'])
                self.assertIn('Email configuration is missing', data['message'])

    def test_send_otp_register_missing_name_or_email(self):
        """Test customer registration validation limits (missing name/email)"""
        # Missing name
        payload_no_name = {
            "phone": "9999999999",
            "email": "test@gmail.com",
            "action": "register"
        }
        with self.client.post('/api/send-otp',
                              data=json.dumps(payload_no_name),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('Name, email, and phone are required', data['message'])

        # Missing email
        payload_no_email = {
            "phone": "9999999999",
            "name": "Test User",
            "action": "register"
        }
        with self.client.post('/api/send-otp',
                              data=json.dumps(payload_no_email),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('Name, email, and phone are required', data['message'])

    def test_javascript_braces_balance(self):
        """Verify that the separated JavaScript file has fully balanced braces"""
        import subprocess
        import sys
        result = subprocess.run([sys.executable, 'check.py'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('Braces are balanced!', result.stdout)

    def test_inventory_overrides_flow(self):
        """Test GET /api/inventory/overrides and POST /api/owner/update-inventory flow"""
        # 1. Fetch initial overrides (should be empty list)
        with self.client.get('/api/inventory/overrides') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['overrides'], [])

        # 2. Post a new override (mark product 1 out of stock, requires owner login)
        with self.client.session_transaction() as sess:
            sess['is_owner'] = True

        payload = {
            "product_id": 1,
            "in_stock": 0,
            "price": 25.0
        }
        with self.client.post('/api/owner/update-inventory',
                                    data=json.dumps(payload),
                                    content_type='application/json') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['message'], 'Inventory override saved successfully')

        # 3. Fetch overrides again (should contain the updated record)
        with self.client.get('/api/inventory/overrides') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(len(data['overrides']), 1)
            override = data['overrides'][0]
            self.assertEqual(override['product_id'], 1)
            self.assertEqual(override['in_stock'], 0)
            self.assertEqual(override['price'], 25.0)

        # 4. Try posting with missing parameters (should return 400)
        bad_payload = {
            "product_id": 2
        }
        with self.client.post('/api/owner/update-inventory',
                                    data=json.dumps(bad_payload),
                                    content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.data)
            self.assertFalse(data['success'])
            self.assertIn('required', data['message'])

    def test_unauthorized_owner_access(self):
        """Verify that unauthorized requests to owner endpoints are blocked with 403"""
        # Ensure we are not logged in as owner
        with self.client.session_transaction() as sess:
            sess.pop('is_owner', None)

        endpoints = [
            ('/api/owner/orders', 'GET', None),
            ('/api/owner/verify-payment', 'POST', {"order_id": "123", "action": "confirm"}),
            ('/api/owner/update-status', 'POST', {"order_id": "123", "status": "packing"}),
            ('/api/owner/cancel-order', 'POST', {"order_id": "123"}),
            ('/api/owner/clear-old-orders', 'POST', {"days": 30}),
            ('/api/owner/update-inventory', 'POST', {"product_id": 1, "in_stock": 1})
        ]
        for url, method, payload in endpoints:
            if method == 'GET':
                with self.client.get(url) as response:
                    self.assertEqual(response.status_code, 403, f"Endpoint {url} should return 403")
            else:
                with self.client.post(url, data=json.dumps(payload or {}), content_type='application/json') as response:
                    self.assertEqual(response.status_code, 403, f"Endpoint {url} should return 403")

    def test_idor_customer_profile_save(self):
        """Verify that a customer cannot modify another customer's profile"""
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "1111111111"

        profile_data = {
            "phone": "2222222222",
            "email": "victim@gmail.com",
            "name": "Victim Name",
            "addresses": ["Victim Address"],
            "khata_bal": 500.0
        }
        with self.client.post('/api/customer/save-profile',
                              data=json.dumps(profile_data),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 403)

    def test_idor_customer_profile_load_protection(self):
        """Verify that loading another customer's profile only exposes the name for lookup and hides sensitive fields"""
        # Create victim profile first
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "2222222222"
        
        profile_data = {
            "phone": "2222222222",
            "email": "victim@gmail.com",
            "name": "Victim Name",
            "addresses": ["Victim Address"],
            "khata_bal": 500.0
        }
        self.client.post('/api/customer/save-profile',
                         data=json.dumps(profile_data),
                         content_type='application/json')

        # Log in as attacker (different phone)
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "1111111111"

        with self.client.get('/api/customer/load-profile?phone=2222222222') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertEqual(data['name'], "Victim Name")
            self.assertNotIn('email', data)
            self.assertNotIn('addresses', data)
            self.assertNotIn('khata_bal', data)

    def test_idor_my_orders_protection(self):
        """Verify that a customer cannot load another customer's order history"""
        with self.client.session_transaction() as sess:
            sess['customer_phone'] = "1111111111"

        with self.client.get('/api/my-orders?phone=2222222222') as response:
            self.assertEqual(response.status_code, 403)

    def test_unhandled_type_conversions_prevention(self):
        """Verify that invalid types result in 400 Bad Request instead of 500 Server Crash"""
        # 1. Invalid total in api_place_order
        order_payload = {
            "customer_name": "Test User",
            "customer_phone": "9876543210",
            "customer_email": "test@gmail.com",
            "payment_method": "cash",
            "total": "not-a-number",
            "items": {"Milk": 1}
        }
        with self.client.post('/api/place-order',
                              data=json.dumps(order_payload),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)

        # 2. Invalid days in clear-old-orders (requires owner auth)
        with self.client.session_transaction() as sess:
            sess['is_owner'] = True
        with self.client.post('/api/owner/clear-old-orders',
                              data=json.dumps({"days": "not-an-integer"}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)

        # 3. Invalid in_stock in update-inventory
        with self.client.post('/api/owner/update-inventory',
                              data=json.dumps({"product_id": 1, "in_stock": "not-an-integer"}),
                              content_type='application/json') as response:
            self.assertEqual(response.status_code, 400)

    def test_security_headers_present(self):
        """Verify that security headers are injected in HTTP responses"""
        with self.client.get('/') as response:
            self.assertEqual(response.headers.get('X-Frame-Options'), 'DENY')
            self.assertEqual(response.headers.get('X-Content-Type-Options'), 'nosniff')
            self.assertEqual(response.headers.get('X-XSS-Protection'), '1; mode=block')
            self.assertEqual(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')

    def test_session_check_flow(self):
        """Verify session check endpoint returns correct session details for client verification"""
        # 1. Initially should be logged out
        with self.client.get('/api/session-check') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertFalse(data['is_logged_in'])
            self.assertFalse(data['is_owner'])
            self.assertIsNone(data['customer_phone'])

        # 2. Log in as owner, check session details
        with self.client.session_transaction() as sess:
            sess['is_owner'] = True
        with self.client.get('/api/session-check') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertTrue(data['is_logged_in'])
            self.assertTrue(data['is_owner'])

        # 3. Log in as customer, check session details
        with self.client.session_transaction() as sess:
            sess.pop('is_owner', None)
            sess['customer_phone'] = '9876543210'
        with self.client.get('/api/session-check') as response:
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.data)
            self.assertTrue(data['success'])
            self.assertTrue(data['is_logged_in'])
            self.assertFalse(data['is_owner'])
            self.assertEqual(data['customer_phone'], '9876543210')

if __name__ == '__main__':
    unittest.main()

