from uuid import UUID, uuid4

from domain.models import MessageKey, Principal, Session


def test_message_public_id_is_scoped_to_session() -> None:
    session_id = uuid4()
    key = MessageKey(session_id=session_id, ordinal=7)

    assert key.public_id == f"{session_id}:7"


def test_session_owner_has_no_internal_user_id() -> None:
    session = Session(
        id=uuid4(),
        owner=Principal(issuer="https://qjudge.test", subject="user-42"),
        title="New chat",
        context={},
    )

    assert set(session.owner.__dataclass_fields__) == {"issuer", "subject"}
    assert isinstance(session.id, UUID)
