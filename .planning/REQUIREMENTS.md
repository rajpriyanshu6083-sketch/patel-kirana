# Requirements: Patel Kirana

**Defined:** 2026-06-11
**Core Value:** Provide a fast, local network-accessible grocery ordering system that enables neighborhood customers to place orders easily and helps the owner keep track of order payments and Khata balances.

## v1 Requirements

### Refactoring & Code Quality
- [ ] **REFACT-01**: Refactor `app.py` by extracting database initialization and helper CRUD functions (e.g. `_save_order()`, `_load_customer()`) into a dedicated module (`db_utils.py` or similar).
- [ ] **REFACT-02**: Extract Gmail SMTP email sending and Fast2SMS API calling logic out of `app.py` into separate service modules (`services/email_service.py` and `services/sms_service.py`).
- [ ] **REFACT-03**: Restructure routes in `app.py` to keep them clean, readable, and separated by concern (e.g. customer APIs vs owner dashboard APIs).

### Client Script Extraction
- [ ] **CLIENT-01**: Extract embedded client-side JavaScript from the `<script>` block in `templates/index.html` into a separate, clean client asset file (`static/js/app.js`).
- [ ] **CLIENT-02**: Verify that extracting script elements does not disrupt standard frontend SPA rendering, network calls, state, routing, or Jinja variables.

### Testing Improvements
- [ ] **TEST-01**: Write additional unit/integration tests covering OTP authentication, registration limits, and registration success flow.
- [ ] **TEST-02**: Write tests verifying the database isolation state during test teardowns to guarantee no test database state leaks into production database files.

## v2 Requirements
- **LOCAL-01**: Local indexedDB backup for carts to preserve checkout progress even after browser tabs close or server outages.
- **NOTIF-01**: Push notifications alerting customer when their order moves to `delivery` or `delivered` states.

## Out of Scope
| Feature | Reason |
|---------|--------|
| Multi-tenant shop capability | Single-owner shop tool by design. |
| Third-party payment gateway integration | Direct UPI peer-to-peer manual verification avoids commercial API costs and transaction processing charges. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REFACT-01 | Phase 1 | Pending |
| REFACT-02 | Phase 1 | Pending |
| REFACT-03 | Phase 1 | Pending |
| CLIENT-01 | Phase 2 | Pending |
| CLIENT-02 | Phase 2 | Pending |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-11*
*Last updated: 2026-06-11 after initial definition*
