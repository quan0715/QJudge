"""Widget resource helpers for QJudge MCP ChatGPT Apps."""

import os


MCP_APP_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app"
CLASSROOM_LIST_TEMPLATE_URI = "ui://widget/classroom-list-v2.html"


def read_widget_js(bundle_name: str, *, base_dir: str) -> str:
    """Read a built widget bundle from the MCP image or local dev fallback."""
    widget_js_candidates = [
        os.getenv(f"MCP_WIDGET_{bundle_name.upper().replace('-', '_')}_JS", ""),
        os.path.join(base_dir, f"mcp-widgets/{bundle_name}.js"),
        os.path.join(base_dir, f"../frontend/dist/mcp-widgets/{bundle_name}.js"),
    ]

    try:
        widget_js_path = next(path for path in widget_js_candidates if path and os.path.exists(path))
        with open(widget_js_path, "r", encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, StopIteration):
        return "document.body.innerHTML = '<h1>UI bundle not found. Please run npm run build in frontend.</h1>';"


def widget_html(js_code: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <div id="root"></div>
        <script type="module">{js_code}</script>
      </body>
    </html>
    """
