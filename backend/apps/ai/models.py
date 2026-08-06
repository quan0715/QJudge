"""Django owns no AI domain data.

Sessions, messages, runs, events, usage, and artifacts are persisted by the
independent AI Service.  This module intentionally remains model-free so the
``apps.ai`` package can retain historical migrations and its compatibility BFF.
"""
