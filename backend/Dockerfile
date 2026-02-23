FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set work directory
WORKDIR /app

# Install system dependencies (with retry for flaky network)
RUN for i in 1 2 3 4 5; do \
      apt-get update && \
      apt-get install -y --no-install-recommends \
        postgresql-client gcc \
        libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
        libffi-dev libcairo2 shared-mime-info \
        fonts-noto-cjk fonts-noto-color-emoji && \
      break || sleep 10; \
    done && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# Install Python dependencies
ARG DJANGO_ENV=production
COPY requirements/base.txt requirements/prod.txt requirements/dev.txt ./requirements/
RUN pip install --upgrade pip && \
    if [ "$DJANGO_ENV" = "development" ]; then \
        pip install -r requirements/dev.txt; \
    else \
        pip install -r requirements/prod.txt; \
    fi

# Copy project
COPY . .

# Create logs directory
RUN mkdir -p logs

# Collect static files
# RUN python manage.py collectstatic --noinput || true

# Run gunicorn
CMD ["sh", "-c", "python manage.py migrate && python manage.py collectstatic --noinput && python manage.py runserver 0.0.0.0:8000"]
