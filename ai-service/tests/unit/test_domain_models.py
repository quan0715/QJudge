from uuid import uuid4

from domain.models import MessageKey


def test_message_public_id_is_scoped_to_session() -> None:
    session_id = uuid4()
    key = MessageKey(session_id=session_id, ordinal=7)

    assert key.public_id == f"{session_id}:7"
