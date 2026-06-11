# Testing Patterns

**Analysis Date:** 2026-06-11

## Test Framework

**Runner & Assertion Library:**
- `unittest` (Python standard library) - Runs the test suite and provides standard assertions.
- Matchers: `self.assertEqual()`, `self.assertIn()`, `self.assertTrue()`, `self.assertFalse()`, `self.assertIsNone()`, `self.assertIsNotNone()`.

**Run Commands:**
```bash
python -m unittest test_app.py                      # Run all tests via unittest runner
pytest test_app.py                                  # Run all tests using pytest
```

## Test File Organization

**Location:**
- Colocated in the root folder alongside source files: `test_app.py` tests `app.py`.

**Structure:**
- Flat structure with `test_app.py` containing a single test class inheriting from `unittest.TestCase`:
  ```
  [project-root]/
  ├── app.py
  └── test_app.py
  ```

## Test Setup & Database Isolation

**Suite Setup & Teardown:**
- **`setUp()`**
  - Isolates DB for testing by temporarily overriding `app_module.DB_PATH` to `patel_data_test.db` and calling `_init_db()` to create fresh SQLite tables.
  - Enables testing mode: `app.config['TESTING'] = True`, `app.config['WTF_CSRF_ENABLED'] = False`.
  - Instantiates a Flask test client: `self.client = app.test_client()`.
- **`tearDown()`**
  - Restores the original production/development `DB_PATH`.
  - Reloads orders from the original database.
  - Unlinks the temporary test database file and its sidecar WAL/SHM files (`patel_data_test.db`, `patel_data_test.db-shm`, `patel_data_test.db-wal`).

## Mocking

**Framework:**
- `unittest.mock.patch` (Python standard library).

**Patterns:**
- Mocking external services (Gmail SMTP and Fast2SMS API) using method decorators:
  ```python
  from unittest.mock import patch

  @patch('app.send_email_gmail')
  @patch('app.send_sms_fast2sms')
  def test_place_order_and_management_flows(self, mock_send_sms, mock_send_email):
      mock_send_email.return_value = True
      mock_send_sms.return_value = True
      # Test client requests here
  ```

**What to Mock:**
- Email sending: `app.send_email_gmail`.
- SMS notifications: `app.send_sms_fast2sms`.
- Environmental configurations (e.g., using `patch('app.GMAIL_ADDRESS', 'test@gmail.com')` to bypass credential verification).

**What NOT to Mock:**
- Database connections (these are run against the real isolated sqlite file `patel_data_test.db` to verify SQL execution accuracy).
- Flask route matching and controller handling.

---

*Testing analysis: 2026-06-11*
*Update when test patterns change*
