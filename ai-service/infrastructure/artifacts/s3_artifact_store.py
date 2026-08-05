"""S3-compatible object storage and PostgreSQL artifact metadata adapters."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from domain.models import Artifact, Principal
from infrastructure.database.models import ArtifactRow, RunRow, SessionRow

try:
    from botocore.exceptions import ClientError
except ModuleNotFoundError:  # metadata-only test environments need no S3 SDK import
    class ClientError(Exception):  # type: ignore[no-redef]
        pass


class ArtifactStorageError(RuntimeError):
    pass


class ArtifactObjectNotFound(ArtifactStorageError):
    pass


def _artifact_from_row(row: ArtifactRow) -> Artifact:
    return Artifact(
        id=row.artifact_id,
        session_id=row.session_id,
        produced_by_run_id=row.produced_by_run_id,
        step=row.step,
        filename=row.filename,
        content_type=row.content_type,
        size_bytes=row.size_bytes,
        checksum=row.checksum,
        metadata=dict(row.metadata_),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class SqlAlchemyArtifactRepository:
    """Metadata adapter; object keys are deliberately absent from persistence."""

    def __init__(self, db_session: AsyncSession) -> None:
        self._session = db_session

    async def session_exists(self, session_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(SessionRow.session_id).where(SessionRow.session_id == session_id)
            )
            is not None
        )

    async def session_belongs_to(
        self, principal: Principal, session_id: UUID
    ) -> bool:
        return (
            await self._session.scalar(
                select(SessionRow.session_id).where(
                    SessionRow.session_id == session_id,
                    SessionRow.owner_issuer == principal.issuer,
                    SessionRow.owner_subject == principal.subject,
                )
            )
            is not None
        )

    async def run_belongs_to_session(self, run_id: UUID, session_id: UUID) -> bool:
        return (
            await self._session.scalar(
                select(RunRow.run_id).where(
                    RunRow.run_id == run_id, RunRow.session_id == session_id
                )
            )
            is not None
        )

    async def upsert(self, artifact: Artifact) -> Artifact:
        values = {
            "artifact_id": artifact.id,
            "session_id": artifact.session_id,
            "produced_by_run_id": artifact.produced_by_run_id,
            "step": artifact.step,
            "filename": artifact.filename,
            "content_type": artifact.content_type,
            "size_bytes": artifact.size_bytes,
            "checksum": artifact.checksum,
            "metadata_": dict(artifact.metadata),
        }
        statement = insert(ArtifactRow).values(**values)
        statement = statement.on_conflict_do_update(
            constraint="uq_artifacts_session_step_filename",
            set_={
                "produced_by_run_id": statement.excluded.produced_by_run_id,
                "content_type": statement.excluded.content_type,
                "size_bytes": statement.excluded.size_bytes,
                "checksum": statement.excluded.checksum,
                "metadata": statement.excluded.metadata,
                "updated_at": datetime.now().astimezone(),
            },
        ).returning(ArtifactRow)
        row = await self._session.scalar(statement)
        assert row is not None
        await self._session.flush()
        return _artifact_from_row(row)

    async def list_for_owner(
        self,
        principal: Principal,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        query = (
            select(ArtifactRow)
            .join(SessionRow, SessionRow.session_id == ArtifactRow.session_id)
            .where(
                ArtifactRow.session_id == session_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )
        return await self._list(query, step=step, filename=filename)

    async def list_for_session(
        self,
        session_id: UUID,
        *,
        step: str | None = None,
        filename: str | None = None,
    ) -> list[Artifact]:
        query = select(ArtifactRow).where(ArtifactRow.session_id == session_id)
        return await self._list(query, step=step, filename=filename)

    async def _list(self, query, *, step: str | None, filename: str | None):
        if step is not None:
            query = query.where(ArtifactRow.step == step)
        if filename is not None:
            query = query.where(ArtifactRow.filename == filename)
        rows = (
            await self._session.scalars(
                query.order_by(ArtifactRow.updated_at.desc(), ArtifactRow.artifact_id)
            )
        ).all()
        return [_artifact_from_row(row) for row in rows]

    async def get_for_owner(
        self, principal: Principal, artifact_id: UUID
    ) -> Artifact | None:
        row = await self._session.scalar(
            select(ArtifactRow)
            .join(SessionRow, SessionRow.session_id == ArtifactRow.session_id)
            .where(
                ArtifactRow.artifact_id == artifact_id,
                SessionRow.owner_issuer == principal.issuer,
                SessionRow.owner_subject == principal.subject,
            )
        )
        return _artifact_from_row(row) if row is not None else None

    async def get_for_session(
        self, session_id: UUID, artifact_id: UUID
    ) -> Artifact | None:
        row = await self._session.scalar(
            select(ArtifactRow).where(
                ArtifactRow.session_id == session_id,
                ArtifactRow.artifact_id == artifact_id,
            )
        )
        return _artifact_from_row(row) if row is not None else None


class S3ArtifactStore:
    def __init__(
        self,
        *,
        bucket: str,
        endpoint_url: str = "",
        public_endpoint_url: str = "",
        region: str = "us-east-1",
        access_key: str = "",
        secret_key: str = "",
        presign_ttl_seconds: int = 300,
        auto_create_bucket: bool = True,
        client: Any | None = None,
        public_client: Any | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        self._presign_ttl_seconds = presign_ttl_seconds
        self._auto_create_bucket = auto_create_bucket
        self._bucket_ready = False
        kwargs: dict[str, Any] = {
            "region_name": region,
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
        }
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if client is None:
            import boto3

            client = boto3.client("s3", **kwargs)
        self._client = client
        if public_client is None:
            if public_endpoint_url:
                public_kwargs = {**kwargs, "endpoint_url": public_endpoint_url}
                import boto3

                public_client = boto3.client("s3", **public_kwargs)
            else:
                public_client = client
        self._public_client = public_client

    async def put(self, key: str, content: bytes, content_type: str) -> None:
        await asyncio.to_thread(self._put, key, content, content_type)

    def _put(self, key: str, content: bytes, content_type: str) -> None:
        self._ensure_bucket()
        try:
            self._client.put_object(
                Bucket=self._bucket, Key=key, Body=content, ContentType=content_type
            )
        except ClientError as exc:
            raise ArtifactStorageError("Failed to upload artifact") from exc

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(self._get, key)

    def _get(self, key: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code in {"404", "NoSuchKey", "NotFound", "NoSuchBucket"}:
                raise ArtifactObjectNotFound("Artifact not found") from exc
            raise ArtifactStorageError("Failed to fetch artifact") from exc
        stream = response["Body"]
        try:
            return stream.read()
        finally:
            stream.close()

    async def presign(self, key: str) -> str:
        return await asyncio.to_thread(
            self._public_client.generate_presigned_url,
            ClientMethod="get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=self._presign_ttl_seconds,
        )

    def _ensure_bucket(self) -> None:
        if self._bucket_ready:
            return
        try:
            self._client.head_bucket(Bucket=self._bucket)
            self._bucket_ready = True
            return
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if not self._auto_create_bucket:
                if code in {"403", "AccessDenied", "Forbidden"}:
                    self._bucket_ready = True
                    return
                raise ArtifactStorageError("Failed to access artifact bucket") from exc
            if code not in {"404", "NoSuchBucket", "NotFound"}:
                raise ArtifactStorageError("Failed to access artifact bucket") from exc
        create_params: dict[str, Any] = {"Bucket": self._bucket}
        if self._region and self._region != "us-east-1":
            create_params["CreateBucketConfiguration"] = {
                "LocationConstraint": self._region
            }
        try:
            self._client.create_bucket(**create_params)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code", ""))
            if code != "BucketAlreadyOwnedByYou":
                raise ArtifactStorageError("Failed to create artifact bucket") from exc
        self._bucket_ready = True
