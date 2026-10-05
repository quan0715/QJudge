"""Representative public values for the users HTTP contract (no live tokens)."""

USER = {
    'id': 1, 'username': 'ada', 'email': 'ada@example.test', 'role': 'student',
    'auth_provider': 'email', 'last_login_at': None, 'onboarding_completed_at': None,
    'profile': {'display_name': 'Ada', 'avatar_url': None},
}
SESSION = {'access_token': '<example-access-token>', 'refresh_token': '<example-refresh-token>',
           'expires_in': 900, 'user': USER}
ACTION_LINK = {'id': 1, 'purpose': 'teacher_activation', 'status': 'pending',
               'email': 'teacher@example.test', 'expires_at': '2026-10-06T00:00:00Z',
               'action_link_url': 'https://judge.example.test/invite/example-token'}
SUCCESS_DATA = {
    'CurrentUserView': USER,
    'UserRoleUpdateView': {**USER, 'role': 'teacher'},
    'UserSearchView': [USER],
    'UserPreferencesView': {
        'profile': USER['profile'], 'preferences': {'preferred_language': 'zh-TW',
            'preferred_theme': 'system', 'editor_font_size': 14, 'editor_tab_size': 4},
        'onboarding_completed_at': None,
    },
    'AuthOptionsView': {'password_enabled': True, 'password_reset_enabled': True, 'providers': [
        {'key': 'password', 'type': 'credentials', 'category': 'password',
         'display_name': 'Password credentials', 'display_name_i18n_key': 'auth.providers.password'},
    ]},
    'RegisterView': SESSION,
    'ProviderLoginView': SESSION,
    'OAuthCallbackView': SESSION,
    'TokenRefreshView': {'access_token': '<example-access-token>'},
    'LogoutView': None,
    'PasswordResetRequestView': None,
    'PasswordResetCompleteView': None,
    'AuthSessionListView': [{'id': 1, 'device_id': 'example-device', 'ip_address': '192.0.2.1',
        'user_agent': 'Example browser', 'login_method': 'password',
        'created_at': '2026-10-05T00:00:00Z', 'is_current': True}],
    'LogoutOtherSessionsView': {'blacklisted_count': 1},
    'UserAvatarUploadView': {'avatar_url': 'https://judge.example.test/media/avatar.png',
        'content_type': 'image/png', 'size': 1024, 'alt': 'avatar'},
    'ActionLinkIssueView': ACTION_LINK,
    'ActionLinkInspectView': ACTION_LINK,
    'ActionLinkRedeemView': {**SESSION, 'action_link': ACTION_LINK},
}
ERRORS = {
    '400': ('validation_error', 'Invalid request.'),
    '401': ('not_authenticated', 'Authentication credentials were not provided.'),
    '403': ('permission_denied', 'You do not have permission to perform this action.'),
    '404': ('not_found', 'Not found.'),
    '405': ('method_not_allowed', 'Method not allowed.'),
    '409': ('conflict', 'The request conflicts with the current state.'),
    '429': ('throttled', 'Request was throttled.'),
    '500': ('unknown_error', 'An internal error occurred.'),
    '503': ('db_overloaded', 'Database is temporarily overloaded. Please retry.'),
}


def success_example(view_name, method):
    if view_name not in SUCCESS_DATA:
        return None
    data = SUCCESS_DATA[view_name]
    if view_name == 'ProviderLoginView' and method == 'GET':
        data = {'authorization_url': 'https://identity.example.test/authorize?state=example-state'}
    return {'value': {'data': data, 'meta': {}}}


def error_example(view_name, method, status):
    code, message = ERRORS[status]
    field, details = None, {}
    if status == '400' and view_name == 'UserPreferencesView' and method == 'PATCH':
        field, message = 'preferences.editor_tab_size', '3 is not a valid choice.'
    if view_name == 'ProviderLoginView' and method == 'POST' and status == '401':
        code, message = 'auth_001', '帳號或密碼錯誤'
    if view_name in {'ProviderLoginView', 'OAuthCallbackView'} and method == 'POST' and status == '409':
        code, message = 'active_exam_session_exists', '請回到原本的裝置完成考試後再登入。'
        details = {'active_exam': {'contest_id': '00000000-0000-4000-8000-000000000001',
            'contest_name': 'Example exam', 'participant_id': 1, 'exam_status': 'in_progress'}}
    return {'value': {'errors': [{'code': code, 'message': message, 'field': field, 'details': details}],
                     'meta': {'request_id': None, 'timestamp': '2026-10-05T00:00:00Z'}}}
