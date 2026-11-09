FROM python:3.11-slim

WORKDIR /app

COPY mcp-server/pyproject.toml .
RUN python -m pip install --no-cache-dir --upgrade "pip>=26.3,<27" "setuptools>=84.1,<85" && \
    python -m pip install --no-cache-dir .

COPY mcp-server/ .

EXPOSE 9000

CMD ["python", "server.py"]
