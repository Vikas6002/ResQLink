# ResQLink

**Intelligent Emergency Response and Hospital Coordination System** — Phase 1–4 prototype.

> **This is a software simulation prototype.** It is NOT a medical diagnosis system and does NOT replace emergency professionals. AI features (when added) are decision support only. Use synthetic/demo data only.

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Python, Django, Django REST Framework, PostgreSQL |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Auth | Custom User model, JWT (SimpleJWT), RBAC |
| Testing | pytest, pytest-django |

## Requirements

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

## Environment Variables

Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

Key variables: `DJANGO_SECRET_KEY`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `VITE_API_BASE_URL`.

## PostgreSQL Setup

```sql
CREATE DATABASE resqlink;
CREATE USER resqlink_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE resqlink TO resqlink_user;
```

## Backend Setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

API: http://localhost:8000/api/

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173/

## Demo Accounts

All passwords: `DemoPass123!`

| Role | Email |
|------|-------|
| Admin | demo.admin@resqlink.local |
| Dispatcher | demo.dispatcher@resqlink.local |
| Ambulance Operator | demo.operator@resqlink.local |
| Hospital Staff | demo.hospital@resqlink.local |

## Commands

| Task | Command |
|------|---------|
| Migrations | `python manage.py makemigrations && python manage.py migrate` |
| Demo data | `python manage.py seed_demo_data` |
| Run backend | `python manage.py runserver` |
| Run frontend | `npm run dev` |
| Tests | `pytest` (from `backend/`) |

## Project Structure

```
ResQLink/
├── backend/          # Django monolith
├── frontend/         # React app
├── docs/             # Architecture & API docs
├── .env.example
└── README.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/API.md](docs/API.md) for details.

## Phase 1–4 Scope

Implemented: models, JWT auth, RBAC, emergency CRUD/verify, ambulance/hospital CRUD, optimization algorithms, demo seed, frontend shell.

Deferred to later prompts: AI screening, WebSockets, full dispatch workflow, route optimization, digital handover, analytics dashboards.
