"""Named response contracts for the users-domain JSON boundary."""
from rest_framework import serializers
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.utils import PolymorphicProxySerializer
from drf_spectacular.plumbing import ResolvedComponent
from .serializers import UserSerializer, UserSettingsSerializer, UserLoginRecordSerializer, CurrentUserUpdateSerializer


class AuthSessionObject(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    expires_in = serializers.IntegerField()
    user = UserSerializer()


class AuthProviderOptionObject(serializers.Serializer):
    key = serializers.CharField()
    type = serializers.CharField()
    category = serializers.CharField()
    display_name = serializers.CharField()
    display_name_i18n_key = serializers.CharField(required=False)
    logo_url = serializers.CharField(required=False, allow_blank=True)


class AuthProviderOptionsObject(serializers.Serializer):
    password_enabled = serializers.BooleanField()
    providers = AuthProviderOptionObject(many=True)


class AuthorizationUrlObject(serializers.Serializer):
    authorization_url = serializers.URLField()


class AccessTokenObject(serializers.Serializer):
    access_token = serializers.CharField()


class LogoutOtherSessionsResultObject(serializers.Serializer):
    blacklisted_count = serializers.IntegerField()


class AvatarUploadResultObject(serializers.Serializer):
    avatar_url = serializers.URLField()
    content_type = serializers.CharField()
    size = serializers.IntegerField()
    alt = serializers.CharField(required=False)


class ActionLinkTargetObject(serializers.Serializer):
    type = serializers.CharField()
    id = serializers.CharField()
    name = serializers.CharField()


class ActionLinkObject(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    purpose = serializers.ChoiceField(choices=['teacher_activation', 'classroom_join'])
    status = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    expires_at = serializers.DateTimeField(required=False)
    consumed_at = serializers.DateTimeField(required=False, allow_null=True)
    created_at = serializers.DateTimeField(required=False)
    requires_login = serializers.BooleanField(required=False)
    current_user_email = serializers.EmailField(required=False, allow_null=True)
    current_user_role = serializers.CharField(required=False, allow_null=True)
    can_redeem = serializers.BooleanField(required=False)
    can_consume = serializers.BooleanField(required=False)
    token = serializers.CharField(required=False)
    action_link_url = serializers.URLField(required=False)
    activation_url = serializers.URLField(required=False)
    target = ActionLinkTargetObject(required=False)
    existing_user = serializers.DictField(required=False, allow_null=True)


class ActionLinkAuthSessionObject(AuthSessionObject):
    action_link = ActionLinkObject(required=False)
    invite = ActionLinkObject(required=False)


ERROR_SCHEMA = {
    'type': 'object', 'required': ['errors', 'meta'],
    'properties': {
        'errors': {'type': 'array', 'minItems': 1, 'items': {
            'type': 'object', 'required': ['code', 'message', 'field', 'details'],
            'properties': {
                'code': {'type': 'string', 'pattern': '^[a-z][a-z0-9_]*$'},
                'message': {'type': 'string'},
                'field': {'type': 'string', 'nullable': True},
                'details': {'type': 'object', 'additionalProperties': True},
            },
        }},
        'meta': {'type': 'object', 'required': ['request_id', 'timestamp'], 'properties': {
            'request_id': {'type': 'string', 'nullable': True},
            'timestamp': {'type': 'string', 'format': 'date-time'},
        }},
    },
}


class AvatarUploadRequest(serializers.Serializer):
    file = serializers.FileField()


class UserContractSchema(AutoSchema):
    def get_request_serializer(self):
        if type(self.view).__name__ == 'CurrentUserView':
            return CurrentUserUpdateSerializer
        if type(self.view).__name__ == 'UserAvatarUploadView':
            return AvatarUploadRequest
        return super().get_request_serializer()

    def get_response_serializers(self):
        from apps.classrooms.serializers import ClassroomDetailSerializer
        name = type(self.view).__name__
        contracts = {
            'CurrentUserView': UserSerializer,
            'UserPreferencesView': UserSettingsSerializer,
            'UserSearchView': UserSerializer(many=True),
            'UserRoleUpdateView': UserSerializer,
            'RegisterView': {201: AuthSessionObject},
            'AuthOptionsView': AuthProviderOptionsObject,
            'ProviderLoginView': AuthorizationUrlObject if self.method == 'GET' else AuthSessionObject,
            'OAuthCallbackView': AuthSessionObject,
            'TokenRefreshView': AccessTokenObject,
            'LogoutView': {200: {'type': 'object', 'nullable': True, 'enum': [None]}},
            'AuthSessionListView': UserLoginRecordSerializer(many=True),
            'LogoutOtherSessionsView': LogoutOtherSessionsResultObject,
            'UserAvatarUploadView': {201: AvatarUploadResultObject},
            'ActionLinkIssueView': {200: ActionLinkObject, 201: ActionLinkObject},
            'ActionLinkInspectView': ActionLinkObject,
            'ActionLinkRedeemView': {code: PolymorphicProxySerializer(
                component_name='ActionLinkRedeemObject',
                serializers=[ActionLinkAuthSessionObject, ClassroomDetailSerializer],
                resource_type_field_name=None,
            ) for code in (200, 201)},
        }
        return contracts.get(name, super().get_response_serializers())

    def _get_response_bodies(self, direction='response'):
        responses = super()._get_response_bodies(direction)
        for code, response in responses.items():
            if not code.startswith('2'):
                continue
            for content in response.get('content', {}).values():
                content['schema'] = {
                    'type': 'object', 'required': ['data', 'meta'],
                    'properties': {'data': content['schema'], 'meta': {'type': 'object', 'additionalProperties': True}},
                }
        error = ResolvedComponent(name='ApiErrorObject', type=ResolvedComponent.SCHEMA, schema=ERROR_SCHEMA, object=UserContractSchema)
        self.registry.register_on_missing(error)
        for code in ('400' , '401', '403', '404', '405', '409', '429', '500', '503'):
            responses.setdefault(code, {'description': 'Canonical error', 'content': {'application/json': {'schema': error.ref}}})
        return responses
