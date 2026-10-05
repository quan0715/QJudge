FROM python:3.11-slim

WORKDIR /app

COPY mcp-server/pyproject.toml .
RUN pip install --no-cache-dir .

COPY mcp-server/ .

EXPOSE 9000

CMD ["python", "server.py"]
