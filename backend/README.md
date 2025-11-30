# Backend Development Guide

## 🛠 Prerequisites

- **Python**: 3.10 or higher
- **PostgreSQL**: 15 or higher
- **Redis**: 7 or higher (for Celery and Cache)

## 🚀 Quick Start

### 1. Environment Setup

Create and activate a virtual environment:

```bash
cd backend
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
# venv\Scripts\activate
```

### 2. Install Dependencies

Install development dependencies:

```bash
pip install -r requirements/dev.txt
```

### 3. Configuration

Ensure environment variables are set. You can create a `.env` file in the `backend` directory or the project root.

Key variables needed:
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`
- `SECRET_KEY`
- `DEBUG=True`

### 4. Database Setup

Apply migrations to set up the database schema:

```bash
python manage.py migrate
```

### 5. Run Development Server

Start the Django development server:

```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000`.

## 🧪 Testing

This project uses **pytest** for testing.

### Run All Tests

```bash
pytest
```

### Run Specific Test File

```bash
pytest tests/test_auth.py
```

### Run with Coverage

```bash
pytest --cov=.
```

## 📦 Project Structure

- `apps/`: Django apps (users, problems, submissions, contests)
- `config/`: Project configuration (settings, urls)
- `requirements/`: Dependency files
- `tests/`: Test suite

## 🔧 Common Management Commands

Here are frequently used commands for managing the Django application.

### Database Management

**Make Migrations** (Create migration files based on model changes):
```bash
# Local
python manage.py makemigrations

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py makemigrations
```

**Migrate** (Apply migrations to the database):
```bash
# Local
python manage.py migrate

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

### User Management

**Create Superuser** (Create an admin account):
```bash
# Local
python manage.py createsuperuser

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py createsuperuser
```

### Development Tools

**Django Shell** (Interactive Python shell with Django context):
```bash
# Local
python manage.py shell

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py shell
```

**Collect Static** (Prepare static files for production):
```bash
# Local
python manage.py collectstatic

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py collectstatic
```

**Check System** (Identify potential problems):
```bash
# Local
python manage.py check

# Docker
docker compose -f docker-compose.dev.yml exec backend python manage.py check
```
