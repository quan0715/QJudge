This guide explains how to set up the QJudge local development environment.

## System Requirements

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Git

## Quick Start (Docker, Recommended)

```bash
git clone https://github.com/quan0715/QJudge.git
cd QJudge
cp .env.example .env   # Edit .env with your settings
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev up -d --build
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev ps
./scripts/dev/check-dev-services.sh
```

Services will start at:

- Frontend: `http://localhost:5173`
- Storybook: `http://localhost:6006`
- Backend: `http://localhost:8000`
- AI Service: `http://localhost:8001`
- Storybook via frontend proxy: `http://localhost:5173/dev/storybook/`

## Manual Setup

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
npm run storybook
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### 3. Judge System

The judge image is built automatically with Docker Compose. For standalone builds:

```bash
docker build -t oj-judge:latest -f backend/judge/Dockerfile.judge backend/judge
```

## Project Structure

```
QJudge/
├── frontend/              # React 19 + TypeScript + Carbon
│   └── src/
│       ├── features/      # Feature modules (auth, contest, problems, chatbot)
│       ├── core/          # Use cases, entities, interfaces
│       ├── infrastructure/# API repositories, mappers
│       └── shared/        # Shared UI components
├── backend/               # Django 4.2 + DRF + Celery
│   └── apps/
│       ├── ai/            # AI session, streaming, approval flow
│       ├── judge/         # Judge engine
│       ├── contests/      # Contests & exams
│       └── problems/      # Problem management
├── ai-service/            # FastAPI + LangGraph DeepAgent
├── scripts/               # Deploy & utility scripts
├── docker-compose.yml     # Production compose
├── docker-compose.dev.yml # Development compose
└── .env.example           # Environment variable template
```

## Common Commands

### Frontend

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Start development server |
| `npm run storybook` | Start Storybook dev server |
| `npm run build`   | Build for production     |
| `npm run lint`    | Check code style         |
| `npm run test`    | Run unit tests           |
| `npm run test:api`| Run API integration tests|

### Backend

| Command                            | Description              |
| ---------------------------------- | ------------------------ |
| `python manage.py runserver`       | Start development server |
| `python manage.py migrate`         | Run database migrations  |
| `pytest`                           | Run tests                |
| `python manage.py createsuperuser` | Create admin account     |

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. Key variables:

| Variable | Description |
| --- | --- |
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` for development |
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` for development |
| `DB_NAME/USER/PASSWORD/HOST/PORT` | PostgreSQL connection |
| `REDIS_URL` | Redis connection URL |
| `NYCU_OAUTH_CLIENT_ID/SECRET` | NYCU OAuth credentials |
| `AI_SERVICE_INTERNAL_TOKEN` | Backend ↔ AI service auth |

See `.env.example` and `docs/deployment.md` for the complete list with documentation.

## Common Issues

### Backend SSL error with local postgres

If you see `server does not support SSL, but SSL was required`, add to `.env`:

```
DB_SSLMODE=disable
```

### Frontend cannot connect to backend

Ensure backend is running and check `CORS_ALLOWED_ORIGINS` in `.env`.

### Docker container won't start

```bash
docker ps
docker compose logs <service-name>
```

For the compose-based dev workflow, prefer:

```bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f frontend
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev logs -f storybook
```
