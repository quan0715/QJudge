"""Check the running E2E stack without printing tokens or container logs."""

import json
import os
import secrets
import shlex
import subprocess
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen


compose = shlex.split(os.environ["QJ_DC"])
origin = "http://localhost:8080"
token = secrets.token_urlsafe(32)
payload = json.dumps({
    "password": "Invalid-Token-Probe83!",
    "password_confirm": "Invalid-Token-Probe83!",
}).encode()
request = Request(
    f"{origin}/api/v1/auth/password/resets/{token}",
    data=payload,
    headers={"Content-Type": "application/json"},
)
try:
    with urlopen(request, timeout=10):
        raise AssertionError("Synthetic reset token was unexpectedly accepted")
except HTTPError as error:
    assert error.code == 400, "Reset log probe must reach token validation"
    assert json.load(error)["errors"][0]["code"] == "invalid_reset_token"

marker = f"access-log-probe-{secrets.token_hex(8)}"
with urlopen(f"{origin}/api/v1/auth/providers?probe={marker}", timeout=10) as response:
    assert response.status == 200

for _ in range(20):
    logs = subprocess.run(
        [*compose, "logs", "--no-color", "backend", "frontend"],
        check=True, capture_output=True, text=True,
    ).stdout
    assert token not in logs, "Reset token appeared in container logs"
    if marker in logs:
        print("Reset token absent from backend/nginx logs; ordinary access logging verified.")
        break
    time.sleep(0.25)
else:
    raise AssertionError("Ordinary access log entry missing; probe is inconclusive")
