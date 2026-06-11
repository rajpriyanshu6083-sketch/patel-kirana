# Roadmap: Patel Kirana

## Overview
This roadmap covers the technical cleanup, restructuring, and stabilization of the Patel Kirana (Patel Groceries) local web application. The work is organized into three distinct phases focusing on backend modularization, frontend script separation, and comprehensive test suite additions.

## Phases

- [x] **Phase 1: Backend Refactoring** - Extract database and service components from the monolithic `app.py`.
- [x] **Phase 2: Client-side Script Separation** - Extract inline JavaScript from `templates/index.html` into a standalone asset file.
- [x] **Phase 3: Test Suite Enhancements** - Implement new test coverages and database isolation verifications.

## Phase Details

### Phase 1: Backend Refactoring
**Goal**: Modularize the backend structure by separating database functions and email/SMS triggers into standalone modules.
**Depends on**: Nothing
**Requirements**: REFACT-01, REFACT-02, REFACT-03
**Success Criteria**:
  1. Database tables and data operations run correctly from a new module (`db_utils.py`).
  2. SMTP (Email) and Fast2SMS (SMS) communication helpers run from dedicated files inside a `services/` directory.
  3. The main `app.py` contains only Flask route controllers and configuration logic, reduced to <400 lines of code.
  4. All existing unit tests in `test_app.py` pass without modifications.
**Plans**: 1 plan

Plans:
- [x] 01-01: Modularize database helper functions and external services into separate modules.

---

### Phase 2: Client Script Separation
**Goal**: Remove inline JavaScript from the main UI template to prevent balance verification issues and improve script maintainability.
**Depends on**: Phase 1
**Requirements**: CLIENT-01, CLIENT-02
**Success Criteria**:
  1. No large JavaScript blocks are present in `templates/index.html`.
  2. Frontend logic runs from `static/js/app.js` and loads successfully in the user's browser.
  3. Customer and owner flows (ordering, logs, actions) run exactly as before.
**Plans**: 1 plan

Plans:
- [x] 02-01: Extract client-side JavaScript to a dedicated static file and link it in the templates.

---

### Phase 3: Test Suite Enhancements
**Goal**: Add comprehensive test cases for authentication edge cases and database isolation.
**Depends on**: Phase 2
**Requirements**: TEST-01, TEST-02
**Success Criteria**:
  1. New unit tests verify customer registration limits, validation, and Gmail app credentials checks.
  2. Test execution automatically unlinks temporary test files cleanly under all success and error execution outcomes.
  3. No database test records persist or leak into the production database `patel_data.db`.
**Plans**: 1 plan

Plans:
- [x] 03-01: Add OTP authentication edge-case tests and verify strict test database isolation.

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Refactoring | 1/1 | Completed | 2026-06-11 |
| 2. Client Script Separation | 1/1 | Completed | 2026-06-11 |
| 3. Test Suite Enhancements | 1/1 | Completed | 2026-06-11 |

---
*Roadmap defined: 2026-06-11*
*Last updated: 2026-06-11 after completing Phase 3*
