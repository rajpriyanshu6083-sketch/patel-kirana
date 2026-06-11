# Product Requirement Document (PRD)

## Target Tasks
1. Refactor monolithic app.py database helper and persistence functions into db_utils.py.
2. Refactor app.py external services (Gmail SMTP email and Fast2SMS SMS triggers) into a separate services/ folder.
3. Extract inline client-side JavaScript out of templates/index.html and place it in a static/js/app.js file.
4. Add comprehensive unit/integration test coverage in test_app.py for authentication, DB isolation, and order flows.
