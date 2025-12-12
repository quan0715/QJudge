# Development Setup

This guide explains how to set up the QJudge local development environment.

## System Requirements

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose
- Git

## Quick Start

### 1. Clone the Project

```bash
git clone https://github.com/your-org/qjudge.git
cd qjudge
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend will start at `http://localhost:5173`.

### 3. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Backend will start at `http://localhost:8000`.

### 4. Judge System

The judge system runs in Docker:

```bash
docker compose up -d judge
```

## Project Structure

```
qjudge/
├── frontend/          # React frontend
│   ├── src/
│   │   ├── domains/   # Feature modules
│   │   ├── ui/        # UI components
│   │   └── i18n/      # Internationalization
│   └── public/
├── backend/           # Django backend
│   ├── api/           # API endpoints
│   ├── judge/         # Judge logic
│   └── core/          # Core modules
└── docker/            # Docker configuration
```

## Common Commands

### Frontend

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Start development server |
| `npm run build` | Build for production     |
| `npm run lint`  | Check code style         |
| `npm run test`  | Run tests                |

### Backend

| Command                            | Description              |
| ---------------------------------- | ------------------------ |
| `python manage.py runserver`       | Start development server |
| `python manage.py migrate`         | Run database migrations  |
| `python manage.py test`            | Run tests                |
| `python manage.py createsuperuser` | Create admin account     |

## Environment Variables

### Frontend (.env)

```
VITE_API_URL=http://localhost:8000
```

### Backend (.env)

```
DEBUG=True
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///db.sqlite3
```

## Common Issues

### Frontend cannot connect to backend

Ensure backend is running and check CORS settings.

### Database migration fails

Try deleting migration files and regenerating:

```bash
python manage.py makemigrations
python manage.py migrate
```

### Docker container won't start

Check if Docker service is running:

```bash
docker ps
docker compose logs
```

