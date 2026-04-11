import os


DJANGO_BASE_URL = os.getenv("DJANGO_BASE_URL", "http://localhost:8000")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "9000"))
