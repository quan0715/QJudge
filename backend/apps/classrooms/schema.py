"""Classroom response DTOs, independent of write serializers."""
from apps.core.api.schema import ResponseContractSchema
from .serializers import (
    BoundContestSerializer, ClassroomAnnouncementSerializer,
    ClassroomDetailSerializer, ClassroomMemberSerializer,
)


def object_schema(**properties):
    return {200: {'type': 'object', 'required': list(properties), 'properties': properties}}


class ClassroomSchema(ResponseContractSchema):
    def _get_paginator(self):
        # Custom collection actions return complete arrays, not DRF pages.
        return super()._get_paginator() if self.view.action == 'list' else None

    def get_response_serializers(self):
        action = self.view.action
        method = self.method
        if action == 'create':
            return {201: ClassroomDetailSerializer}
        if action == 'members':
            return ClassroomMemberSerializer(many=True) if method == 'GET' else object_schema(**{
                key: {'type': 'array', 'items': {'type': 'string'}}
                for key in ('added', 'already_exists', 'not_found')
            })
        if action in ('member_detail', 'announcement_detail') and method == 'DELETE':
            return {204: None}
        if action == 'member_detail':
            return object_schema(detail={'type': 'string'})
        if action == 'invite_code':
            return object_schema(invite_code={'type': 'string'})
        if action == 'cover':
            return object_schema(cover_url={'type': 'string'})
        if action == 'announcements':
            return ClassroomAnnouncementSerializer(many=True) if method == 'GET' else {201: ClassroomAnnouncementSerializer}
        if action == 'announcement_detail':
            return ClassroomAnnouncementSerializer
        if action == 'list_contests':
            return BoundContestSerializer(many=True) if method == 'GET' else {201: BoundContestSerializer}
        if action == 'gradebook':
            return object_schema(
                contests={'type': 'array', 'items': {'type': 'object', 'additionalProperties': True}},
                students={'type': 'array', 'items': {'type': 'object', 'additionalProperties': True}},
            )
        return super().get_response_serializers()

    def _get_response_bodies(self, direction='response'):
        if self.view.action == 'gradebook_export':
            return {'200': {'description': 'CSV download.', 'content': {
                'text/csv': {'schema': {'type': 'string', 'format': 'binary'}},
            }}}
        return super()._get_response_bodies(direction)
