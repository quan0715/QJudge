# User API Contract Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every /api/v1/users, /api/v1/auth, and /api/v1/action-links response with the canonical JSON contract while reducing the exposed user projection to fields the product actively consumes.

**Architecture:** apps.users.views.common.SchemaAPIView becomes the pilot marker and installs a DRF renderer that wraps every successful payload as {data, meta}. The core exception path and explicit user-view error helpers emit {errors, meta}; all user-view source responses become raw resource/action payloads. Serializers define one UserObject and one UserSettingsObject; the frontend changes only this domain to the canonical fetch helper in the same change set.

**Tech Stack:** Django 4 / Django REST Framework / drf-spectacular, React 18 / TypeScript / Vitest, Docker Compose test environment, Notion API database documentation.

## Global Constraints

- Scope is exactly the JSON routes owned by apps.users: /api/v1/users, /api/v1/auth, and /api/v1/action-links. OAuth protocol routes outside /api/v1, webhooks, streams, downloads, schema, and documentation routes retain their native contracts.
- Every successful in-scope response is exactly {"data": <named object, array, scalar, or null>, "meta": <object>}. Data and meta are required; command success uses data: null and HTTP 200, never 204.
- Every in-scope error is exactly {"errors": [{"code", "message", "field", "details"}], "meta": {"request_id", "timestamp"}}. Error codes are lower snake case and details is always an object.
- This slice is a hard cut. Do not return success, a top-level singular error, bare serializer data, DRF pagination, a compatibility header, query parameter, version switch, or frontend fallback parser from an included route.
- UserObject contains only id, username, email, role, auth_provider, last_login_at, onboarding_completed_at, and profile {display_name, avatar_url}. Do not expose solved_count, submission_count, accept_rate, is_active, date_joined, or subscription.
- UserSettingsObject contains {profile, preferences, onboarding_completed_at}. PATCH /api/v1/users/me/preferences accepts the nested UserSettingsPatchRequest in docs/superpowers/specs/2026-07-13-api-contract-convergence-design.md.
- Keep denormalized statistics and Django activation data in the database; this change only removes their API projection. Do not add a statistics endpoint or a model migration.
- Preserve current authorization, cookies, status codes, action-link effects, exam-conflict policy, and classroom join result semantics.
- Existing non-user domains keep legacy clients and response format until their own migration. Do not globally replace requestJson or change global DRF renderer settings.
- Regenerate and commit backend/schema.yml; update matching Notion API DB pages only after contract tests and schema agree.
- Work on codex/api-contract-envelope; commit to this branch and open a PR to dev. Do not deploy production.

---

## File Map

| Path | Responsibility |
| --- | --- |
| backend/apps/core/api/envelope.py | Canonical error payload, request metadata, and explicit error response helpers. |
| backend/apps/core/api/renderer.py | JSON renderer that turns raw successful DRF payloads and DRF pages into canonical success documents. |
| backend/apps/core/api/schema.py | drf-spectacular success wrapper and shared error schema for marked views. |
| backend/apps/core/exceptions.py | Selects canonical exceptions for marked views while preserving legacy handling elsewhere. |
| backend/apps/core/views/errors.py | Framework-level production 500 document for the three contract prefixes. |
| backend/config/urls.py | Installs the Django handler500 without changing non-contract paths. |
| backend/apps/users/views/common.py | Marks the complete user domain, installs renderer, exposes request-aware error helpers. |
| backend/apps/users/serializers.py | Defines UserObject, UserSettingsObject, nested update input, and named user-domain response serializers. |
| backend/apps/users/services.py | Builds raw AuthSessionObject payloads rather than legacy envelopes. |
| backend/apps/users/views/account.py, preferences.py, admin.py | Return minimal user/settings data and canonical manual errors. |
| backend/apps/users/views/auth.py, token.py, sessions.py, avatar.py, action_link.py | Return raw auth/action data and canonical manual errors. |
| backend/apps/core/tests/test_api_contract_renderer.py | Renderer, exception handler, and framework-level 500 coverage. |
| backend/apps/users/tests/test_api_contract.py | End-to-end canonical success/error and data-minimization coverage. |
| frontend/src/infrastructure/api/envelope.ts | Strict canonical parser with no legacy coercion. |
| frontend/src/core/entities/auth.entity.ts | Minimal User, UserProfile, UserSettings, and nested request types. |
| frontend/src/infrastructure/api/dto/auth.dto.ts | Canonical response aliases, removing legacy ApiResponse DTOs. |
| frontend/src/infrastructure/api/repositories/auth.repository.ts, user.repository.ts | Use fetchEnvelope for every in-scope endpoint. |
| frontend/src/features/auth/hooks/useUserPreferences.ts | Reads UserSettingsObject and sends nested settings patches. |
| frontend/src/features/auth/screens/OnboardingScreen.tsx | Completes onboarding through the nested request without statistics placeholders. |
| frontend/src/features/admin/screens/UserManagementScreen.tsx | Reads profile.display_name from UserObject. |
| docs/api-conventions.md, docs/plans/api-envelope-migration.md, backend/schema.yml | Publish and record the final contract. |

### Task 1: Establish the Core Contract Boundary

**Files:**
- Create: backend/apps/core/api/renderer.py
- Create: backend/apps/core/views/errors.py
- Create: backend/apps/core/tests/test_api_contract_renderer.py
- Modify: backend/apps/core/api/envelope.py
- Modify: backend/apps/core/exceptions.py
- Modify: backend/apps/users/views/common.py
- Modify: backend/config/urls.py

**Interfaces:**
- Consumes: raw DRF Response.data from a view with api_contract_enabled = True.
- Produces: ContractJSONRenderer, contract_error_response(request, ...), contract_validation_error_response(request, ...), and contract_server_error(request).
- Preserves: envelope_error_actions behaviour for the already-migrated contest answer action and legacy exception documents for every unmarked view.

- [ ] **Step 1: Write failing renderer and exception tests**

~~~python
import json


class ContractView:
    api_contract_enabled = True


def render_contract(response, request):
    rendered = ContractJSONRenderer().render(
        response.data, renderer_context={"response": response, "request": request}
    )
    return json.loads(rendered)


def test_contract_renderer_wraps_a_raw_object(api_rf):
    response = Response({"id": 7, "username": "amy"}, status=200)
    rendered = render_contract(response, api_rf.get("/api/v1/users/me"))
    assert rendered == {"data": {"id": 7, "username": "amy"}, "meta": {}}


def test_contract_renderer_moves_drf_page_members_to_meta(api_rf):
    response = Response({"count": 2, "next": None, "previous": None, "results": [{"id": 7}]})
    rendered = render_contract(response, api_rf.get("/api/v1/users/"))
    assert rendered == {
        "data": [{"id": 7}],
        "meta": {"pagination": {"count": 2, "next": None, "previous": None}},
    }


def test_marked_view_validation_error_has_array_and_request_meta(api_rf):
    request = api_rf.get("/api/v1/users/me")
    request.request_id = "req-contract"
    response = custom_exception_handler(
        ValidationError({"email": ["Enter a valid email address."]}),
        {"request": request, "view": ContractView()},
    )
    assert response.data["errors"][0] == {
        "code": "invalid", "message": "Enter a valid email address.",
        "field": "email", "details": {},
    }
    assert response.data["meta"]["request_id"] == "req-contract"


def test_contract_500_is_canonical_when_debug_is_disabled(api_rf, settings):
    settings.DEBUG = False
    response = contract_server_error(api_rf.get("/api/v1/users/me"))
    assert response.status_code == 500
    assert json.loads(response.content)["errors"][0]["code"] == "internal_error"
~~~

- [ ] **Step 2: Run the test and verify it fails**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/core/tests/test_api_contract_renderer.py
~~~

Expected: failure for missing renderer/error symbols or legacy error shape.

- [ ] **Step 3: Implement the success renderer and request-aware error helpers**

~~~python
# backend/apps/core/api/renderer.py
class ContractJSONRenderer(JSONRenderer):
    media_type = "application/json"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = (renderer_context or {}).get("response")
        if response is not None and response.status_code >= 400:
            return super().render(data, accepted_media_type, renderer_context)
        if isinstance(data, Mapping) and {"count", "next", "previous", "results"}.issubset(data):
            data = {"data": data["results"], "meta": {"pagination": {
                "count": data["count"], "next": data["next"], "previous": data["previous"],
            }}}
        else:
            data = {"data": data, "meta": {}}
        return super().render(data, accepted_media_type, renderer_context)
~~~

~~~python
# backend/apps/core/api/envelope.py
def error_meta(request) -> dict[str, str | None]:
    return {
        "request_id": getattr(request, "request_id", None),
        "timestamp": timezone.now().isoformat(),
    }


def contract_error_response(request, code, message, *, status, field=None, details=None):
    return envelope_error(
        code, message, field=field, details=details, status=status,
        meta=error_meta(request),
    )
~~~

Add contract_validation_error_response(request, errors), which emits one validation_error item per serializer field/message and never places serializer errors at a top-level details key. In SchemaAPIView, set api_contract_enabled = True, renderer_classes = [ContractJSONRenderer], and add error(...) / validation_error(...) methods that bind self.request.

- [ ] **Step 4: Route marked exceptions and only marked exceptions to the canonical shape**

~~~python
# backend/apps/core/exceptions.py
def _should_use_envelope_errors(context):
    view = context.get("view")
    if view is None:
        return False
    if getattr(view, "api_contract_enabled", False):
        return True
    allowed = getattr(view, "envelope_error_actions", None)
    return allowed is not None and getattr(view, "action", None) in allowed
~~~

Keep _build_envelope_error_payload as the one DRF translator, lower-case all generated codes, and use error_meta(request) for validation, permission, not-found, throttling, and db_overloaded. Do not touch the unmarked legacy branch.

Add contract_server_error(request) in apps.core.views.errors. When DEBUG is false and the path starts with /api/v1/users, /api/v1/auth, or /api/v1/action-links, return JsonResponse with internal_error and error_meta(request). Delegate all other paths to django.views.defaults.server_error. Set handler500 = "apps.core.views.errors.contract_server_error" at module scope in backend/config/urls.py.

- [ ] **Step 5: Run the core tests and preserve unmarked legacy behaviour**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/core/tests/test_api_contract_renderer.py apps/contests/tests
~~~

Expected: the new tests pass; contest tests retain their existing contracts except the pre-existing action-level envelope route.

- [ ] **Step 6: Commit**

~~~bash
git add backend/apps/core/api/envelope.py backend/apps/core/api/renderer.py \
  backend/apps/core/exceptions.py backend/apps/core/views/errors.py \
  backend/apps/core/tests/test_api_contract_renderer.py backend/apps/users/views/common.py \
  backend/config/urls.py
git commit -m "refactor(api): add user contract response boundary"
~~~

### Task 2: Define Minimal User and Settings Projections

**Files:**
- Modify: backend/apps/users/serializers.py
- Modify: backend/apps/users/views/account.py
- Modify: backend/apps/users/views/preferences.py
- Modify: backend/apps/users/views/admin.py
- Modify: backend/apps/users/services.py
- Modify: backend/apps/users/tests/test_current_user_profile.py
- Modify: backend/apps/users/tests/test_preferences.py
- Modify: backend/apps/users/tests/test_user_management.py
- Create: backend/apps/users/tests/test_api_contract.py

**Interfaces:**
- Produces UserSerializer as the sole UserObject projection and UserSettingsSerializer for preferences.
- Consumes nested UserSettingsPatchSerializer input: profile, preferences, and onboarding_completed_at.
- Preserves username/email update policy and all DB statistics fields without serializing them.

- [ ] **Step 1: Write failing route-level projection tests**

~~~python
def test_current_user_returns_only_the_canonical_user_object(authenticated_client, user):
    body = authenticated_client.get("/api/v1/users/me").json()
    assert set(body) == {"data", "meta"}
    assert set(body["data"]) == {
        "id", "username", "email", "role", "auth_provider", "last_login_at",
        "onboarding_completed_at", "profile",
    }
    assert set(body["data"]["profile"]) == {"display_name", "avatar_url"}
    assert not {"is_active", "date_joined", "subscription", "solved_count",
                "submission_count", "accept_rate"} & set(body["data"])


def test_preferences_patch_accepts_nested_identity_and_editor_settings(authenticated_client):
    response = authenticated_client.patch("/api/v1/users/me/preferences", {
        "profile": {"display_name": "Ada"},
        "preferences": {"preferred_theme": "dark", "editor_tab_size": 2},
        "onboarding_completed_at": "2026-07-13T04:00:00Z",
    }, format="json")
    assert response.status_code == 200
    assert response.json()["data"]["profile"]["display_name"] == "Ada"
    assert response.json()["data"]["preferences"]["editor_tab_size"] == 2
    assert response.json()["data"]["onboarding_completed_at"] is not None


def test_user_search_uses_user_object_and_never_returns_activation_state(superadmin_client, user):
    item = superadmin_client.get("/api/v1/users/").json()["data"][0]
    assert "display_name" not in item
    assert item["profile"]["display_name"] == user.profile.display_name
    assert "is_active" not in item
~~~

- [ ] **Step 2: Run the focused tests and verify the legacy shape fails**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_current_user_profile.py apps/users/tests/test_preferences.py \
  apps/users/tests/test_user_management.py apps/users/tests/test_api_contract.py
~~~

Expected: failure because success is still present, preferences are flattened, and search uses UserSearchSerializer.

- [ ] **Step 3: Replace overlapping serializers with the two named projections**

~~~python
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["display_name", "avatar_url"]
        read_only_fields = fields


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ["preferred_language", "preferred_theme", "editor_font_size", "editor_tab_size"]
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    onboarding_completed_at = serializers.DateTimeField(
        source="profile.onboarding_completed_at", read_only=True
    )

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "auth_provider", "last_login_at",
            "onboarding_completed_at", "profile",
        ]


class UserSettingsSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(source="*", read_only=True)
    preferences = UserPreferencesSerializer(source="*", read_only=True)

    class Meta:
        model = UserProfile
        fields = ["profile", "preferences", "onboarding_completed_at"]
        read_only_fields = fields
~~~

Delete UserSearchSerializer, get_subscription, and every statistic/activation/date-joined field from response serializers. Add nested UserProfilePatchSerializer, UserPreferencesPatchSerializer, and UserSettingsPatchSerializer. Validate profile.avatar_url with the current http/https rule and validate onboarding_completed_at against the current server-time limit.

- [ ] **Step 4: Return raw named data from user views**

~~~python
# account.py
def get(self, request):
    return Response(UserSerializer(request.user).data)

def patch(self, request):
    if request.user.auth_provider != "email" and requested_mutable_fields:
        return self.error("account_fields_locked", "SSO/OAuth 帳號無法修改使用者名稱或電子郵件，僅可編輯顯示名稱", status=403)
    serializer = CurrentUserUpdateSerializer(user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    user = User.objects.select_related("profile").get(pk=request.user.pk)
    return Response(UserSerializer(user).data)
~~~

~~~python
# preferences.py
def patch(self, request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    serializer = UserSettingsPatchSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    apply_settings_patch(profile, serializer.validated_data, now=timezone.now())
    profile.save()
    cache.delete(f"user_preferences:v1:{request.user.id}")
    return Response(UserSettingsSerializer(profile).data)
~~~

~~~python
def apply_settings_patch(profile, data, *, now):
    for field, value in data.get("profile", {}).items():
        setattr(profile, field, value)
    for field, value in data.get("preferences", {}).items():
        setattr(profile, field, value)
    if "onboarding_completed_at" in data:
        profile.onboarding_completed_at = now if data["onboarding_completed_at"] else None
~~~

apply_settings_patch updates only supplied nested fields. A non-null onboarding_completed_at records server time, matching current behaviour; null clears it. Cache only UserSettingsSerializer(profile).data. Admin search uses User.objects.select_related("profile"), serializes UserSerializer(many=True), and uses query_too_short, user_not_found, and cannot_modify_self error codes.

Change JWTService.get_user_response_data to return raw AuthSessionObject data:

~~~python
return {
    "access_token": tokens["access"],
    "refresh_token": tokens["refresh"],
    "expires_in": tokens["expires_in"],
    "user": UserSerializer(user).data,
}
~~~

- [ ] **Step 5: Run focused user projection tests**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_current_user_profile.py apps/users/tests/test_preferences.py \
  apps/users/tests/test_user_management.py apps/users/tests/test_api_contract.py
~~~

Expected: all user/profile/preferences/admin projections are canonical and no response leaks a removed field.

- [ ] **Step 6: Commit**

~~~bash
git add backend/apps/users/serializers.py backend/apps/users/services.py \
  backend/apps/users/views/account.py backend/apps/users/views/preferences.py \
  backend/apps/users/views/admin.py backend/apps/users/tests/test_current_user_profile.py \
  backend/apps/users/tests/test_preferences.py backend/apps/users/tests/test_user_management.py \
  backend/apps/users/tests/test_api_contract.py
git commit -m "refactor(users): minimize user response projections"
~~~

### Task 3: Migrate Auth, Sessions, Avatar, and Action-Link Responses

**Files:**
- Modify: backend/apps/users/views/auth.py
- Modify: backend/apps/users/views/token.py
- Modify: backend/apps/users/views/sessions.py
- Modify: backend/apps/users/views/avatar.py
- Modify: backend/apps/users/views/action_link.py
- Modify: backend/apps/users/views/common.py
- Modify: backend/apps/users/tests/test_auth.py
- Modify: backend/apps/users/tests/test_auth_enhanced.py
- Modify: backend/apps/users/tests/test_auth_provider_options.py
- Modify: backend/apps/users/tests/test_avatar_upload.py
- Modify: backend/apps/users/tests/test_teacher_activation.py
- Modify: backend/apps/users/tests/test_teacher_activation_permissions.py

**Interfaces:**
- Consumes SchemaAPIView.error and raw JWTService.get_user_response_data from Tasks 1-2.
- Produces canonical AuthSessionObject, AuthProviderOptionsObject, AccessTokenObject, LoginRecordObject array, LogoutOtherSessionsResultObject, AvatarUploadResultObject, and existing action-link/classroom data.
- Preserves JWT cookies, refresh behaviour, membership side effects, and action-link lifecycle status codes.

- [ ] **Step 1: Add representative contract assertions for every response family**

~~~python
def assert_contract_success(response):
    assert response.status_code < 400
    assert set(response.json()) == {"data", "meta"}
    assert "success" not in response.json()


def assert_contract_error(response, status_code, code):
    assert response.status_code == status_code
    body = response.json()
    assert set(body) == {"errors", "meta"}
    assert body["errors"][0]["code"] == code
    assert body["errors"][0]["field"] is None
    assert set(body["meta"]) == {"request_id", "timestamp"}


def test_password_login_returns_auth_session_contract(client, password_user):
    response = client.post("/api/v1/auth/login/password", {
        "identifier": password_user.email, "password": "secret",
    })
    assert_contract_success(response)
    assert set(response.json()["data"]) >= {
        "access_token", "refresh_token", "expires_in", "user",
    }
    assert "is_active" not in response.json()["data"]["user"]


def test_action_link_classroom_redeem_wraps_classroom_detail(authenticated_client, classroom, token):
    response = authenticated_client.post(f"/api/v1/action-links/{token}/redeem", {})
    assert_contract_success(response)
    assert response.json()["data"]["uuid"] == str(classroom.uuid)
~~~

- [ ] **Step 2: Run the auth/action-link tests and verify legacy documents fail**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_auth.py apps/users/tests/test_auth_enhanced.py \
  apps/users/tests/test_auth_provider_options.py apps/users/tests/test_avatar_upload.py \
  apps/users/tests/test_teacher_activation.py apps/users/tests/test_teacher_activation_permissions.py
~~~

Expected: failure because the views still construct success, error, and bare classroom response bodies.

- [ ] **Step 3: Convert all user auth/action responses**

~~~python
# common.py
def token_cookie_response(user, tokens, *, status_code=200, extra_data=None):
    payload = JWTService.get_user_response_data(user, tokens)
    if extra_data:
        payload.update(extra_data)
    response = Response(payload, status=status_code)
    set_jwt_cookies(response, tokens)
    return response


def build_active_exam_login_block_response(user, request, provider):
    return contract_error_response(
        request, "active_exam_session_exists",
        "偵測到你有進行中的考試，請回到原本的裝置完成考試後再登入。",
        status=409, details={"active_exam": {
            "contest_id": str(contest.id), "contest_name": contest.name,
            "participant_id": conflict.participant.id,
            "exam_status": conflict.participant.exam_status,
        }},
    )
~~~

For every serializer input, use serializer.is_valid(raise_exception=True). Replace each manually assembled error with a lower-snake code: password_auth_disabled, registration_failed, invalid_credentials, password_provider_requires_post, unknown_provider, oauth_provider_requires_redirect, oauth_callback_failed, no_jti, upload_failed, action_link_not_issuable, action_link_not_found, action_link_expired, action_link_already_redeemed, and action_link_revoked. Retain permission_denied, classroom_not_found, token_required, and validation_error for those conditions.

Return raw successful payloads: provider options object; {authorization_url}; AuthSessionObject; session-record array; {logged_out_sessions: count}; null for current logout; avatar upload object; action-link issue/inspect objects; and ClassroomDetailSerializer(...).data for a classroom join. The renderer supplies the outer document. Keep the DEBUG token endpoint on this contract but continue excluding it from public schema.

- [ ] **Step 4: Verify cookies, action-link effects, and error details**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_auth.py apps/users/tests/test_auth_enhanced.py \
  apps/users/tests/test_auth_provider_options.py apps/users/tests/test_avatar_upload.py \
  apps/users/tests/test_teacher_activation.py apps/users/tests/test_teacher_activation_permissions.py \
  apps/users/tests/test_exam_login_security.py
~~~

Expected: JWT cookies remain present and active-exam data appears only at errors[0].details.active_exam.

- [ ] **Step 5: Commit**

~~~bash
git add backend/apps/users/views/common.py backend/apps/users/views/auth.py \
  backend/apps/users/views/token.py backend/apps/users/views/sessions.py \
  backend/apps/users/views/avatar.py backend/apps/users/views/action_link.py \
  backend/apps/users/tests/test_auth.py backend/apps/users/tests/test_auth_enhanced.py \
  backend/apps/users/tests/test_auth_provider_options.py backend/apps/users/tests/test_avatar_upload.py \
  backend/apps/users/tests/test_teacher_activation.py backend/apps/users/tests/test_teacher_activation_permissions.py
git commit -m "refactor(auth): converge user-domain API responses"
~~~

### Task 4: Publish Exact OpenAPI Components and Operations

**Files:**
- Create: backend/apps/core/api/schema.py
- Modify: backend/config/settings/base.py
- Modify: backend/apps/users/serializers.py
- Modify: backend/apps/users/views/account.py, preferences.py, admin.py, auth.py, avatar.py, sessions.py, token.py, action_link.py
- Create: backend/apps/users/tests/test_api_schema.py
- Modify: backend/schema.yml

**Interfaces:**
- Consumes api_contract_enabled and named serializers from Tasks 1-3.
- Produces ContractAutoSchema, ApiErrorEnvelope component, and schema.yml operations whose success body has data/meta and errors reference ApiErrorEnvelope.

- [ ] **Step 1: Write a schema regression test**

~~~python
def test_user_operations_use_contract_envelopes(schema):
    me = schema["paths"]["/api/v1/users/me"]["get"]["responses"]["200"]
    assert set(me["content"]["application/json"]["schema"]["properties"]) == {"data", "meta"}
    assert me["content"]["application/json"]["schema"]["properties"]["data"]["$ref"].endswith("/User")

    patch = schema["paths"]["/api/v1/users/me/preferences"]["patch"]
    request_ref = patch["requestBody"]["content"]["application/json"]["schema"]["$ref"]
    assert request_ref.endswith("/UserSettingsPatchRequest")
    assert patch["responses"]["400"]["content"]["application/json"]["schema"]["$ref"].endswith("/ApiErrorEnvelope")
~~~

- [ ] **Step 2: Run the schema test and verify it fails**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_api_schema.py
~~~

Expected: failure because current AutoSchema does not wrap marked responses or register canonical errors.

- [ ] **Step 3: Add marker-aware schema wrapping and exact operation serializers**

~~~python
# backend/apps/core/api/schema.py
class ContractAutoSchema(AutoSchema):
    def _get_response_for_code(self, serializer, status_code, media_types=None, direction="response"):
        response = super()._get_response_for_code(serializer, status_code, media_types, direction)
        if not getattr(self.view, "api_contract_enabled", False):
            return response
        for media in response.get("content", {}).values():
            if 200 <= int(status_code) < 300:
                media["schema"] = contract_success_schema(media["schema"])
            else:
                media["schema"] = self.resolve_serializer(ApiErrorEnvelopeSerializer, direction).ref
        return response


def contract_success_schema(data_schema):
    return {
        "type": "object", "required": ["data", "meta"],
        "properties": {
            "data": data_schema,
            "meta": {"$ref": "#/components/schemas/ContractMetaObject"},
        },
    }
~~~

Define ContractMetaSerializer, ApiErrorItemSerializer, ApiErrorMetaSerializer, and ApiErrorEnvelopeSerializer with extend_schema_serializer(component_name=...) so errors, code, message, field, details, request_id, and timestamp are concrete OpenAPI fields:

~~~python
@extend_schema_serializer(component_name="ContractMetaObject")
class ContractMetaSerializer(serializers.Serializer):
    pass


@extend_schema_serializer(component_name="ApiErrorMetaObject")
class ApiErrorMetaSerializer(serializers.Serializer):
    request_id = serializers.CharField(allow_null=True)
    timestamp = serializers.DateTimeField()


class ApiErrorItemSerializer(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    field = serializers.CharField(allow_null=True)
    details = serializers.DictField()


class ApiErrorEnvelopeSerializer(serializers.Serializer):
    errors = ApiErrorItemSerializer(many=True)
    meta = ApiErrorMetaSerializer()
~~~

Set REST_FRAMEWORK["DEFAULT_SCHEMA_CLASS"] to apps.core.api.schema.ContractAutoSchema. Mark every method in the eight user view modules with extend_schema: exact request serializer, exact success serializer, query q for user search, and applicable 400/401/403/404/409/429/500 ApiErrorEnvelope statuses. Define named output serializers for auth/session/avatar/action-link result objects instead of serializers.Serializer or untyped dictionaries.

- [ ] **Step 4: Generate and inspect the artifact**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  python manage.py spectacular --file schema.yml
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/users/tests/test_api_schema.py
~~~

Expected: backend/schema.yml changes only where user operations/components and shared contract components require it.

- [ ] **Step 5: Commit**

~~~bash
git add backend/apps/core/api/schema.py backend/config/settings/base.py \
  backend/apps/users/serializers.py backend/apps/users/views \
  backend/apps/users/tests/test_api_schema.py backend/schema.yml
git commit -m "docs(api): publish user contract schemas"
~~~

### Task 5: Convert User-Domain Frontend Clients and Consumers

**Files:**
- Modify: frontend/src/infrastructure/api/envelope.ts
- Modify: frontend/src/core/entities/auth.entity.ts
- Modify: frontend/src/infrastructure/api/dto/auth.dto.ts
- Modify: frontend/src/infrastructure/api/repositories/auth.repository.ts
- Modify: frontend/src/infrastructure/api/repositories/user.repository.ts
- Modify: frontend/src/features/auth/hooks/useUserPreferences.ts
- Modify: frontend/src/features/auth/screens/OnboardingScreen.tsx
- Modify: frontend/src/features/admin/screens/UserManagementScreen.tsx
- Modify: frontend/src/infrastructure/api/repositories/auth.repository.test.ts
- Modify: frontend/src/infrastructure/api/repositories/user.repository.test.ts
- Modify: frontend/src/features/auth/hooks/useUserPreferences.test.ts
- Modify: frontend/src/features/auth/screens/OnboardingScreen.test.tsx

**Interfaces:**
- Consumes canonical {data, meta} and {errors, meta} only from Tasks 1-4.
- Produces minimal User, UserProfile, UserPreferences, UserSettings, and UpdatePreferencesRequest types.
- Preserves requestJson and legacy HTTP message extraction for all non-user repositories.

- [ ] **Step 1: Update tests to use canonical fixtures and reject legacy error fixtures**

~~~ts
it("unwraps a canonical current-user response", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ data: userFixture, meta: {} }));
  await expect(getCurrentUser()).resolves.toEqual({ data: userFixture, meta: {} });
});

it("does not coerce a legacy user-domain error", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ success: false, error: { message: "old" } }, 400));
  await expect(getCurrentUser()).rejects.toMatchObject({ code: "contract_malformed" });
});

it("sends a nested preferences patch", async () => {
  await updatePreferences({ preferences: { editor_tab_size: 2 } });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    body: JSON.stringify({ preferences: { editor_tab_size: 2 } }),
  }));
});
~~~

- [ ] **Step 2: Run focused frontend tests and verify legacy DTO failures**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm run test -- --run infrastructure/api/repositories/auth.repository.test.ts \
  infrastructure/api/repositories/user.repository.test.ts features/auth/hooks/useUserPreferences.test.ts \
  features/auth/screens/OnboardingScreen.test.tsx
~~~

Expected: type and fixture failures because current repositories call requestJson and read success.

- [ ] **Step 3: Make the parser strict and define minimal objects**

~~~ts
// envelope.ts
const errorsFromCanonicalBody = (body: unknown, fallbackMessage: string): ApiErrorItem[] => {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as ApiErrorEnvelope).errors;
    if (Array.isArray(errors) && errors.length > 0) return errors;
  }
  return [{ code: "contract_malformed", message: fallbackMessage, field: null, details: {} }];
};
~~~

~~~ts
// auth.entity.ts
export interface UserProfile { display_name: string; avatar_url: string | null; }
export interface UserPreferences {
  preferred_language: string;
  preferred_theme: ThemePreference;
  editor_font_size: number;
  editor_tab_size: 2 | 4;
}
export interface UserSettings {
  profile: UserProfile;
  preferences: UserPreferences;
  onboarding_completed_at: string | null;
}
export interface User {
  id: number; username: string; email: string; role: "student" | "teacher" | "admin";
  auth_provider: string; last_login_at: string | null; onboarding_completed_at: string | null;
  profile: UserProfile;
}
export interface UpdatePreferencesRequest {
  profile?: Partial<UserProfile>;
  preferences?: Partial<UserPreferences>;
  onboarding_completed_at?: string | null;
}
export type ManagedUser = User;
export interface AuthorizationUrlObject { authorization_url: string; }
~~~

Remove UserSubscription, stats fields, is_active, every legacy ApiResponse<T>, and duplicated success response interface in user DTO types.

- [ ] **Step 4: Migrate only the included repositories and consumers**

~~~ts
// user.repository.ts
export const getPreferences = () =>
  fetchEnvelope<UserSettings>(httpClient.get("/api/v1/users/me/preferences"), "Failed to fetch preferences");

export const updatePreferences = (data: UpdatePreferencesRequest) =>
  fetchEnvelope<UserSettings>(httpClient.patch("/api/v1/users/me/preferences", data), "Failed to update preferences");

// useUserPreferences.ts
const settings = (await getUserPreferences()).data;
applyPreferencesToState(settings.preferences);
syncAuthUserProfile(settings.profile);
await updateUserPreferences({ preferences: { preferred_theme: newPref } });
await updateUserPreferences({ profile: { display_name: name } });
~~~

Every auth/action-link repository function uses fetchEnvelope. Logout and logoutOtherSessions consume data: null or their named action result. getOAuthUrl returns (await fetchEnvelope<AuthorizationUrlObject>(...)).data.authorization_url. Keep refresh's HTTP-status-only internal flow unchanged. In onboarding, send {profile: {display_name}, preferences: {...}, onboarding_completed_at} and update local User from UserSettingsObject. In user management, use user.profile.display_name. Replace legacy nested error access with err.message from EnvelopeError.

- [ ] **Step 5: Run focused frontend tests and type/build checks**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm run test -- --run infrastructure/api/repositories/auth.repository.test.ts \
  infrastructure/api/repositories/user.repository.test.ts features/auth/hooks/useUserPreferences.test.ts \
  features/auth/screens/OnboardingScreen.test.tsx
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
~~~

Expected: focused tests and build pass; user-domain repositories have no requestJson import and no user stats projection consumer.

- [ ] **Step 6: Commit**

~~~bash
git add frontend/src/infrastructure/api/envelope.ts frontend/src/core/entities/auth.entity.ts \
  frontend/src/infrastructure/api/dto/auth.dto.ts frontend/src/infrastructure/api/repositories/auth.repository.ts \
  frontend/src/infrastructure/api/repositories/user.repository.ts frontend/src/features/auth/hooks/useUserPreferences.ts \
  frontend/src/features/auth/screens/OnboardingScreen.tsx frontend/src/features/admin/screens/UserManagementScreen.tsx \
  frontend/src/infrastructure/api/repositories/auth.repository.test.ts frontend/src/infrastructure/api/repositories/user.repository.test.ts \
  frontend/src/features/auth/hooks/useUserPreferences.test.ts frontend/src/features/auth/screens/OnboardingScreen.test.tsx
git commit -m "refactor(frontend): consume user contract envelopes"
~~~

### Task 6: Publish Documentation and Synchronize Notion

**Files:**
- Modify: docs/api-conventions.md
- Modify: docs/plans/api-envelope-migration.md
- Modify: docs/superpowers/specs/2026-07-13-api-contract-convergence-design.md
- Modify: backend/schema.yml
- Update: Notion API DB pages for the public operations below

**Interfaces:**
- Consumes passing tests and generated backend/schema.yml from Tasks 1-5.
- Produces implementation-accurate formal documents: named data object, authorization, headers, path/query/body, JSON responses, and exact error codes.

- [ ] **Step 1: Verify documentation source material**

Run:
~~~bash
git diff origin/dev -- backend/schema.yml docs/api-conventions.md
rg -n '"success"|"error"' backend/apps/users/views \
  frontend/src/infrastructure/api/repositories/auth.repository.ts \
  frontend/src/infrastructure/api/repositories/user.repository.ts
~~~

Expected: no legacy response construction remains in included views/repositories; examples come from schema and route tests.

- [ ] **Step 2: Update repository documentation**

Add mandatory success/error shapes, lower-snake error codes, metadata, pagination transformation, protocol exemptions, and the complete user-domain hard-cut prefixes to docs/api-conventions.md. In docs/plans/api-envelope-migration.md, mark the old action-level description superseded for apps.users while retaining it as historical guidance for unconverted domains. Set the design status to implemented only after Task 7 passes.

- [ ] **Step 3: Update the Notion API DB pages**

Update one page per HTTP operation, preserving the existing minimal database columns and replacing the page body for:

~~~text
GET    /api/v1/users/
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/preferences
PATCH  /api/v1/users/me/preferences
POST   /api/v1/users/me/avatar
PATCH  /api/v1/users/{id}/role
GET    /api/v1/auth/providers
POST   /api/v1/auth/register/password
GET    /api/v1/auth/login/{provider}
POST   /api/v1/auth/login/{provider}
POST   /api/v1/auth/callback/{provider}
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/sessions
POST   /api/v1/auth/sessions/logout-others
POST   /api/v1/action-links
GET    /api/v1/action-links/{token}
POST   /api/v1/action-links/{token}/redeem
~~~

Each page contains only: purpose, authorization, required headers, path/query/body tables, named data schema, actual success status plus JSON example, actual error status/code plus JSON example, and one implementation source link. State UserObject and UserSettingsObject once as shared schemas and link to them, rather than copying variants. Keep DEBUG /api/v1/auth/dev/token internal in code/schema and do not make a public Notion page.

### Task 7: Run Release Gates and Prepare the Dev PR

**Files:**
- Modify only if a verification failure identifies a contract defect in a Task 1-6 file.

**Interfaces:**
- Consumes all source, schema, and documentation changes from Tasks 1-6.
- Produces a verified branch and a ready-for-review PR from codex/api-contract-envelope to dev.

- [ ] **Step 1: Run release gates sequentially**

Run:
~~~bash
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  pytest -q apps/core/tests/test_api_contract_renderer.py apps/users/tests
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  python manage.py makemigrations --check --dry-run
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh test exec -T backend \
  python manage.py spectacular --validate --file /tmp/qjudge-user-contract-schema.yml
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend \
  npm run test -- --run
bash .codex/skills/qjudge-env-compose-owner/scripts/qjudge-dc.sh dev exec -T frontend npm run build
git diff --check origin/dev...HEAD
~~~

Expected: all tests, schema validation, migration check, frontend build, and whitespace check pass.

- [ ] **Step 2: Inspect, commit docs, push, and create the dev PR**

~~~bash
git add docs/api-conventions.md docs/plans/api-envelope-migration.md \
  docs/superpowers/specs/2026-07-13-api-contract-convergence-design.md backend/schema.yml
git commit -m "docs(api): document user-domain contract"
git push -u origin codex/api-contract-envelope
gh pr create --base dev --head codex/api-contract-envelope \
  --title "refactor(api): converge user-domain contract" \
  --body "Closes #204

Hard-cuts apps.users JSON routes to canonical success/error envelopes, minimizes UserObject data exposure, updates schema and Notion API documentation, and migrates all in-repository user-domain clients."
~~~

Expected: a ready-for-review PR targets dev; it does not merge or deploy automatically.
