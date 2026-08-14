"""AI BFF permission boundary.

User-facing eligibility is enforced by ``apps.users.permissions``.  The AI
Service authenticates resource tokens, so Django owns no internal shared-secret
permission class.
"""
