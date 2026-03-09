"""JWT login helper for Locust users."""
import uuid
import logging

logger = logging.getLogger(__name__)


def login_student(client, email: str, password: str) -> dict | None:
    """
    POST /api/v1/auth/email/login → returns full response data or None.
    Sets Authorization header and X-Device-Id on the client session.
    """
    device_id = uuid.uuid4().hex
    resp = client.post(
        "/api/v1/auth/email/login",
        json={"email": email, "password": password},
        name="/api/v1/auth/email/login",
    )
    if resp.status_code != 200:
        logger.error("Login failed for %s: %s %s", email, resp.status_code, resp.text[:200])
        return None

    data = resp.json().get("data", resp.json())
    token = data.get("access_token") or data.get("access")
    if not token:
        logger.error("No access token in login response for %s", email)
        return None

    client.headers.update({
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
    })
    return data
