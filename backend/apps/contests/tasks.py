"""Contest Celery task module.

Exam monitoring, heartbeat evaluation, locked-attempt escalation, and scheduled
exam-end submission are owned by the per-exam Integrity Worker.  Keep this
module as the stable import location for unrelated future contest tasks; it
intentionally exports no exam-authority task.
"""
