# DMS AI Platform (Docker Compose)

Services:
- `frontend` (React + Vite) : http://localhost:5173
- `backend` (Node/Express) : http://localhost:8080/api
- `db` (PostgreSQL)
- `minio` (S3 compatible storage) : http://localhost:9001
- `ai` (Flask OCR/classification/summary) : http://localhost:5000

## Demo accounts
- `admin@tt.local` / `password123`
- `manager@tt.local` / `password123`
- `user@tt.local` / `password123`

## Start
1) Build & start:
- `docker compose up --build`

2) Run migrations + seed (once):
- `docker compose exec backend node dist/db/migrate.js`
- `docker compose exec backend node dist/db/seed.js`

Then open http://localhost:5173

## Notes
- Upload supports: PDF/DOCX/TXT.
- AI service does baseline extraction (PDF text + OCR fallback), summary, and classification (Finance/RH/Support Client).
- Search is PostgreSQL full-text (websearch).

Next steps (if you want): background job queue, Elasticsearch, document similarity index, admin UI for user management.
