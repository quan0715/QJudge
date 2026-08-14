"""Owner-scoped artifact metadata and object access routes."""

from __future__ import annotations

from typing import Annotated, Any
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import RedirectResponse

from api.dependencies import current_principal, get_artifact_service
from api.errors import ERROR_RESPONSES
from api.schemas import ArtifactCreateRequest, ArtifactListResponse, ArtifactResponse
from domain.models import Principal

router = APIRouter(prefix="/v1", tags=["artifacts"], responses=ERROR_RESPONSES)

def _safe_content_response(content: bytes, filename: str) -> Response:
    # This endpoint is served on the application origin. Always download
    # opaque bytes so stored HTML/SVG/PDF cannot become executable content.
    encoded_filename = quote(filename, safe="")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/artifacts", response_model=ArtifactListResponse)
async def list_artifacts(
    session_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_artifact_service)],
    step: Annotated[str | None, Query(max_length=64)] = None,
    filename: Annotated[str | None, Query(max_length=255)] = None,
) -> ArtifactListResponse:
    artifacts = await service.list(
        principal,
        session_id,
        step=step,
        filename=filename,
    )
    results = [ArtifactResponse.from_domain(artifact) for artifact in artifacts]
    return ArtifactListResponse(count=len(results), results=results)


@router.post(
    "/artifacts",
    response_model=ArtifactResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_artifact(
    body: ArtifactCreateRequest,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_artifact_service)],
) -> ArtifactResponse:
    artifact = await service.put(
        principal,
        session_id=body.session_id,
        produced_by_run_id=body.produced_by_run_id,
        step=body.step,
        filename=body.filename,
        content=body.decoded_content(),
        content_type=body.content_type,
        metadata=body.metadata,
    )
    return ArtifactResponse.from_domain(artifact)


@router.get("/artifacts/{artifact_id}", response_model=ArtifactResponse)
async def get_artifact(
    artifact_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_artifact_service)],
) -> ArtifactResponse:
    return ArtifactResponse.from_domain(
        await service.get_metadata(principal, artifact_id)
    )


@router.get(
    "/artifacts/{artifact_id}/content",
    response_class=Response,
    responses={
        200: {
            "description": "Artifact bytes",
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            },
        }
    },
)
async def get_artifact_content(
    artifact_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_artifact_service)],
) -> Response:
    artifact = await service.get_metadata(principal, artifact_id)
    content = await service.get_content(principal, artifact_id)
    return _safe_content_response(content, artifact.filename)


@router.get(
    "/artifacts/{artifact_id}/download",
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    response_class=RedirectResponse,
    responses={
        307: {
            "description": "Temporary redirect to an owner-scoped download URL",
            "headers": {
                "Location": {
                    "description": "Presigned artifact download URL",
                    "schema": {"type": "string", "format": "uri"},
                }
            },
        }
    },
)
async def download_artifact(
    artifact_id: UUID,
    principal: Annotated[Principal, Depends(current_principal)],
    service: Annotated[Any, Depends(get_artifact_service)],
) -> RedirectResponse:
    url = await service.get_download_url(principal, artifact_id)
    return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
