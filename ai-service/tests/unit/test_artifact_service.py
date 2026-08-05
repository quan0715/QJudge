"""Application-level artifact ownership and storage-key behavior."""

from __future__ import annotations

import io
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from application.artifacts import ArtifactNotFound, ArtifactService
from domain.models import Artifact, Principal, Session
from infrastructure.artifacts.s3_artifact_store import (
    ArtifactObjectNotFound,
    ArtifactStorageError,
    S3ArtifactStore,
)


class FakeArtifactRepository:
    def __init__(self, sessions: list[Session]) -> None:
        self.sessions = {session.id: session for session in sessions}
        self.artifacts: dict[UUID, Artifact] = {}
        self.run_sessions: dict[UUID, UUID] = {}

    async def session_exists(self, session_id: UUID) -> bool:
        return session_id in self.sessions

    async def session_belongs_to(self, principal: Principal, session_id: UUID) -> bool:
        session = self.sessions.get(session_id)
        return session is not None and session.owner == principal

    async def run_belongs_to_session(self, run_id: UUID, session_id: UUID) -> bool:
        return self.run_sessions.get(run_id) == session_id

    async def upsert(self, artifact: Artifact) -> Artifact:
        existing = next(
            (
                value
                for value in self.artifacts.values()
                if (value.session_id, value.step, value.filename)
                == (artifact.session_id, artifact.step, artifact.filename)
            ),
            None,
        )
        if existing is not None:
            artifact = replace(artifact, id=existing.id, created_at=existing.created_at)
        self.artifacts[artifact.id] = artifact
        return artifact

    @asynccontextmanager
    async def atomic_write(self) -> AsyncIterator[None]:
        before = dict(self.artifacts)
        try:
            yield
        except Exception:
            self.artifacts = before
            raise

    async def list_for_owner(self, principal, session_id, *, step=None, filename=None):
        if not await self.session_belongs_to(principal, session_id):
            return []
        return await self.list_for_session(session_id, step=step, filename=filename)

    async def list_for_session(self, session_id, *, step=None, filename=None):
        return [
            artifact
            for artifact in self.artifacts.values()
            if artifact.session_id == session_id
            and (step is None or artifact.step == step)
            and (filename is None or artifact.filename == filename)
        ]

    async def get_for_owner(self, principal, artifact_id):
        artifact = self.artifacts.get(artifact_id)
        if artifact is None:
            return None
        return artifact if await self.session_belongs_to(principal, artifact.session_id) else None

    async def get_for_session(self, session_id, artifact_id):
        artifact = self.artifacts.get(artifact_id)
        return artifact if artifact is not None and artifact.session_id == session_id else None


class FakeArtifactStore:
    def __init__(self) -> None:
        self.keys: list[str] = []
        self.objects: dict[str, bytes] = {}

    async def put(self, key: str, content: bytes, content_type: str) -> None:
        self.keys.append(key)
        self.objects[key] = content

    async def get(self, key: str) -> bytes:
        return self.objects[key]

    async def presign(self, key: str) -> str:
        return f"https://objects.example/{key}"


@pytest.fixture
def principal() -> Principal:
    return Principal(issuer="issuer", subject="owner")


@pytest.fixture
def principal_b() -> Principal:
    return Principal(issuer="issuer", subject="other")


@pytest.fixture
def session(principal: Principal) -> Session:
    return Session(id=uuid4(), owner=principal, title="Chat", context={})


@pytest.fixture
def artifact_service(session: Session):
    repository = FakeArtifactRepository([session])
    store = FakeArtifactStore()
    service = ArtifactService(repository, store, max_bytes=1024)
    return service


async def test_put_derives_object_key_from_only_session_and_artifact_id(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    artifact = await artifact_service.put(
        principal=principal,
        session_id=session.id,
        produced_by_run_id=None,
        step="rubric",
        filename="rubric.json",
        content=b"{}",
        content_type="application/json",
        metadata={},
    )

    assert artifact_service.store.keys == [
        f"ai-artifacts/{session.id}/{artifact.id}"
    ]


async def test_other_owner_cannot_download_artifact(
    artifact_service: ArtifactService,
    principal: Principal,
    principal_b: Principal,
    session: Session,
) -> None:
    artifact = await artifact_service.put(
        principal=principal,
        session_id=session.id,
        produced_by_run_id=None,
        step="rubric",
        filename="rubric.json",
        content=b"{}",
        content_type="application/json",
        metadata={},
    )

    with pytest.raises(ArtifactNotFound):
        await artifact_service.get_content(principal_b, artifact.id)


async def test_upsert_preserves_artifact_id_and_replaces_content(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    first = await artifact_service.put(
        principal, session.id, None, "rubric", "rubric.json", b"one", "text/plain", {}
    )
    second = await artifact_service.put(
        principal, session.id, None, "rubric", "rubric.json", b"two", "text/plain", {}
    )

    assert second.id == first.id
    assert artifact_service.store.keys[-1] == f"ai-artifacts/{session.id}/{first.id}"
    assert await artifact_service.get_content(principal, first.id) == b"two"


async def test_producing_run_must_belong_to_artifact_session(
    artifact_service: ArtifactService,
    principal: Principal,
    session: Session,
) -> None:
    foreign_run = uuid4()

    with pytest.raises(ArtifactNotFound):
        await artifact_service.put(
            principal,
            session.id,
            foreign_run,
            "rubric",
            "rubric.json",
            b"{}",
            "application/json",
            {},
        )


class FakeProviderError(Exception):
    def __init__(self, code: str = "InternalError") -> None:
        self.response = {"Error": {"Code": code}}
        super().__init__(code)


class FakeBody(io.BytesIO):
    def __init__(self, content: bytes) -> None:
        super().__init__(content)
        self.was_closed = False

    def close(self) -> None:
        self.was_closed = True
        super().close()


class FakeS3Client:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.head_error: Exception | None = None
        self.put_error: Exception | None = None
        self.get_error: Exception | None = None
        self.presign_error: Exception | None = None
        self.create_error: Exception | None = None
        self.body = FakeBody(b"stored bytes")

    def head_bucket(self, **kwargs):
        self.calls.append(("head_bucket", kwargs))
        if self.head_error:
            raise self.head_error

    def create_bucket(self, **kwargs):
        self.calls.append(("create_bucket", kwargs))
        if self.create_error:
            raise self.create_error

    def put_object(self, **kwargs):
        self.calls.append(("put_object", kwargs))
        if self.put_error:
            raise self.put_error

    def get_object(self, **kwargs):
        self.calls.append(("get_object", kwargs))
        if self.get_error:
            raise self.get_error
        return {"Body": self.body}

    def generate_presigned_url(self, **kwargs):
        self.calls.append(("generate_presigned_url", kwargs))
        if self.presign_error:
            raise self.presign_error
        return "https://browser.example/download"


async def test_s3_store_put_checks_bucket_once_and_uploads_content() -> None:
    client = FakeS3Client()
    store = S3ArtifactStore(bucket="artifacts", client=client)

    await store.put("first", b"one", "text/plain")
    await store.put("second", b"two", "application/json")

    assert client.calls == [
        ("head_bucket", {"Bucket": "artifacts"}),
        (
            "put_object",
            {
                "Bucket": "artifacts",
                "Key": "first",
                "Body": b"one",
                "ContentType": "text/plain",
            },
        ),
        (
            "put_object",
            {
                "Bucket": "artifacts",
                "Key": "second",
                "Body": b"two",
                "ContentType": "application/json",
            },
        ),
    ]


async def test_s3_store_get_returns_bytes_and_closes_provider_stream() -> None:
    client = FakeS3Client()
    store = S3ArtifactStore(bucket="artifacts", client=client)

    assert await store.get("result") == b"stored bytes"
    assert client.body.was_closed is True
    assert client.calls == [
        ("get_object", {"Bucket": "artifacts", "Key": "result"})
    ]


async def test_s3_store_get_maps_provider_not_found_to_stable_error() -> None:
    client = FakeS3Client()
    client.get_error = FakeProviderError("NoSuchKey")
    store = S3ArtifactStore(bucket="artifacts", client=client)

    with pytest.raises(ArtifactObjectNotFound, match="Artifact not found"):
        await store.get("missing")


async def test_s3_store_presign_uses_browser_endpoint_and_ttl(monkeypatch) -> None:
    private_client = FakeS3Client()
    browser_client = FakeS3Client()
    boto3 = SimpleNamespace()
    boto3.calls = []

    def make_client(service_name, **kwargs):
        boto3.calls.append((service_name, kwargs))
        return browser_client

    boto3.client = make_client
    monkeypatch.setitem(sys.modules, "boto3", boto3)
    store = S3ArtifactStore(
        bucket="artifacts",
        endpoint_url="http://minio:9000",
        public_endpoint_url="https://objects.example",
        region="ap-northeast-1",
        access_key="key",
        secret_key="secret",
        presign_ttl_seconds=123,
        client=private_client,
    )

    assert await store.presign("result") == "https://browser.example/download"
    assert boto3.calls == [
        (
            "s3",
            {
                "region_name": "ap-northeast-1",
                "aws_access_key_id": "key",
                "aws_secret_access_key": "secret",
                "endpoint_url": "https://objects.example",
            },
        )
    ]
    assert browser_client.calls == [
        (
            "generate_presigned_url",
            {
                "ClientMethod": "get_object",
                "Params": {"Bucket": "artifacts", "Key": "result"},
                "ExpiresIn": 123,
            },
        )
    ]


async def test_s3_store_presign_wraps_provider_failure() -> None:
    client = FakeS3Client()
    client.presign_error = FakeProviderError()
    store = S3ArtifactStore(bucket="artifacts", client=client)

    with pytest.raises(ArtifactStorageError, match="Failed to create artifact URL"):
        await store.presign("result")


async def test_s3_store_creates_missing_regional_bucket() -> None:
    client = FakeS3Client()
    client.head_error = FakeProviderError("NoSuchBucket")
    store = S3ArtifactStore(
        bucket="artifacts", region="ap-northeast-1", client=client
    )

    await store.put("result", b"bytes", "text/plain")

    assert client.calls[:2] == [
        ("head_bucket", {"Bucket": "artifacts"}),
        (
            "create_bucket",
            {
                "Bucket": "artifacts",
                "CreateBucketConfiguration": {
                    "LocationConstraint": "ap-northeast-1"
                },
            },
        ),
    ]


@pytest.mark.parametrize(
    ("operation", "message"),
    [
        ("put", "Failed to upload artifact"),
        ("bucket", "Failed to access artifact bucket"),
        ("create", "Failed to create artifact bucket"),
    ],
)
async def test_s3_store_wraps_provider_failures(operation: str, message: str) -> None:
    client = FakeS3Client()
    if operation == "put":
        client.put_error = FakeProviderError()
    elif operation == "bucket":
        client.head_error = FakeProviderError("AccessDenied")
    else:
        client.head_error = FakeProviderError("NoSuchBucket")
        client.create_error = FakeProviderError()
    store = S3ArtifactStore(bucket="artifacts", client=client)

    with pytest.raises(ArtifactStorageError, match=message):
        await store.put("result", b"bytes", "text/plain")
