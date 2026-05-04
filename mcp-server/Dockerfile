FROM node:22-slim AS widget-builder

WORKDIR /src

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm --prefix frontend ci

COPY frontend/index.html \
     frontend/tsconfig.json \
     frontend/tsconfig.app.json \
     frontend/tsconfig.node.json \
     frontend/vite.config.ts \
     ./frontend/
COPY frontend/public ./frontend/public
COPY frontend/src ./frontend/src

RUN npm --prefix frontend run build

FROM python:3.11-slim

WORKDIR /app

COPY mcp-server/pyproject.toml .
RUN pip install --no-cache-dir "mcp[cli]>=1.9.0" "httpx>=0.27.0"

COPY mcp-server/ .
COPY --from=widget-builder /src/frontend/dist/mcp-widgets/ ./mcp-widgets/

EXPOSE 9000

CMD ["python", "server.py"]
