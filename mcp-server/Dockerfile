FROM python:3.11-slim

WORKDIR /app

COPY mcp-server/pyproject.toml .
RUN pip install --no-cache-dir "mcp[cli]>=1.9.0" "httpx>=0.27.0"

COPY mcp-server/ .

EXPOSE 9000

CMD ["python", "server.py"]
