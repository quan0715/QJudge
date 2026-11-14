# API response 遷移清單

基準：`origin/dev` 的 `a7847bda`。從 Django URL resolver 展開（test settings，未連接資料庫）；排除 Django admin、HEAD/OPTIONS 與格式 suffix 的重複別名。下表包含 application JSON、router root 及協定例外，不能把「未盤清」當成已遷移。DEBUG-only dev/token 未在 production 表內。

## 遷移狀態

- 已有契約：users/auth/action-links；results、grade appeals；all-answers 僅 projection=grading 的成功資料已包裝。
- A 課堂：19 個 JSON method/action 已人工對照；CSV 匯出排除。本批直接統一為 `{data, meta}`／`{errors, meta}`，前端、MCP、CLI 同步更新，不提供舊格式相容。
- B–F：路由已列出；caller 欄只表示實際 URL literal 的候選位置（動態組字不一定被命中），仍需逐一核實 response/status/manual error 與所有呼叫端。尚未啟用。
- 此批為 breaking change：部署需同步更新 backend、frontend、MCP、CLI，避開進行中考試並讓舊分頁重新載入。外部 caller 未能從 repo 證明完整；須依新契約更新，不增加相容層。
- `legacy_schema_alignment.py` 與 migrations 不屬於此遷移。

## A：人工確認的遷移前行為與呼叫端

所有項目由 `backend/apps/classrooms/views.py:ClassroomViewSet` 擁有；既有 JSONRenderer（開發環境可能另有 browsable renderer），錯誤經 custom_exception_handler 產生 legacy success/error。此 view 無手動 error Response；validation、permission、not found、storage failure 均 raise exception。JSON 成功 200，create／新增公告／新增課堂競賽為 201，三種 DELETE 為 204。PUT/PATCH update 回序列化物件。list 使用原生 count/next/previous/results 分頁，其餘 array/object 如下。

| method / action | 現行成功 | Frontend 函式（classroom.repository.ts） | MCP / CLI | 測試 |
| --- | --- | --- | --- | --- |
| GET list | paginated | getClassrooms | qjudge_browse list_classrooms / list_classrooms | test_views_enhanced.py |
| POST create | object, 201 | createClassroom | 未找到（external unknown） | test_create_permissions.py |
| GET retrieve | object | getClassroom | qjudge_browse get_classroom | test_permissions.py |
| PUT update | object | 無已知呼叫端 | external unknown | test_views_enhanced.py |
| PATCH partial_update | object | updateClassroom | external unknown | test_views_enhanced.py |
| DELETE destroy | empty, 204 | deleteClassroom | external unknown | test_permissions.py |
| GET members | array | 無直接 API 呼叫；retrieve 的 detail 含成員 | external unknown | test_membership_integrity.py |
| POST members | added/already_exists/not_found object | addMembers | external unknown | test_membership_integrity.py |
| PATCH member_detail | detail object | updateMemberRole | external unknown | test_permissions.py |
| DELETE member_detail | empty, 204 | removeMember | external unknown | test_membership_integrity.py |
| POST invite_code | invite_code object | regenerateCode | external unknown | test_views_enhanced.py |
| GET list_contests | array | retrieve detail supplies contests | qjudge_browse list_classroom_contests (+ list_contests fallback) / list_classroom_exams | test_views_enhanced.py |
| POST list_contests | object, 201 | createClassroomContest | qjudge_contest_manager create | test_views_enhanced.py |
| GET gradebook | object | getClassroomGradebook | external unknown | test_gradebook_api.py |
| GET gradebook_export | CSV, excluded | exportClassroomGradebook | external unknown | test_gradebook_csv.py |
| GET announcements | array | retrieve detail supplies announcements | external unknown | announcements/ |
| POST announcements | object, 201 | createAnnouncement | external unknown | announcements/ |
| PATCH announcement_detail | object | updateAnnouncement | external unknown | announcements/ |
| DELETE announcement_detail | empty, 204 | deleteAnnouncement | external unknown | announcements/ |
| POST cover | cover_url object | uploadClassroomCover | external unknown | test_cover_upload.py |

錯誤代碼：legacy handler 的 PERMISSION_DENIED / NOT_FOUND / VALIDATION_ERROR / NOT_AUTHENTICATED / ERROR / DB_OVERLOADED 對應 canonical permission_denied / not_found / validation_error（或 DRF field code）/ not_authenticated / error / db_overloaded。保留 HTTP status 與 Retry-After / X-QJudge-Retryable；巢狀 validation 使用 dotted field。既有 frontend 用 requestJson、ensureOk、直接 .json；getClassroom 非 2xx 回 undefined；下載用 blob。MCP django_api 成功原樣傳出，_get_all_rows 依 results/next 翻頁；CLI 格式不符會回空集合。本批 caller 已改成 strict unwrap，禁止以猜測式 fallback 掩蓋版本錯誤。MCP／CLI 依 meta.pagination 翻頁，缺少必要契約時明確報錯。

課堂加入／離開不全在 ClassroomViewSet：加入走 users action-links，已是 envelope；逐批測試必須包含該既有流程。AI service 未找到直接課堂 URL；透過 MCP 的流量由 MCP caller 涵蓋。

## 全部解析路由

狀態：`canonical` 為 view api_contract_enabled；`action-errors` 只保證 exception opt-in，不保證 success/manual errors；`audit` 待逐 action 人工確認。caller 為候選 source:function（相同 URL 的不同 method 需進一步核對）；`unknown` 不能解讀為無人使用。完整 status、pagination 與非 JSON 例外必須在每批切換前補齊。

| Method | Route | Owner.action | 狀態 / 批次 | Caller 候選 |
| --- | --- | --- | --- | --- |
| GET | `/` | `apps.core.views.landing_markdown.LandingMarkdownView.get` | audit / F | unknown |
| * | `/api/health/` | `apps.core.views.health.health_check.function` | audit / F | unknown |
| * | `/.well-known/oauth-authorization-server` | `apps.oauth.views.oauth_authorization_server_metadata.function` | audit / protocol/root | unknown |
| * | `/.well-known/jwks.json` | `apps.oauth.views.oauth_jwks.function` | audit / protocol/root | unknown |
| * | `/.well-known/mcp/server-card.json` | `apps.oauth.views.mcp_server_card.function` | audit / protocol/root | unknown |
| * | `/o/register/` | `apps.oauth.views.dynamic_client_registration.function` | audit / protocol/root | unknown |
| * | `/o/authorize/` | `apps.oauth.views.authorize_redirect.function` | audit / protocol/root | unknown |
| POST | `/api/oauth/approve/` | `apps.oauth.views.ApproveAuthorizationView.post` | audit / protocol/root | unknown |
| POST | `/api/oauth/resource-token/` | `apps.oauth.views.ResourceTokenView.post` | audit / protocol/root | unknown |
| POST | `/api/oauth/token-exchange/` | `apps.oauth.views.TokenExchangeView.post` | audit / protocol/root | unknown |
| GET | `/o/authorize/` | `oauth2_provider.views.base.AuthorizationView.get` | audit / protocol/root | unknown |
| POST | `/o/authorize/` | `oauth2_provider.views.base.AuthorizationView.post` | audit / protocol/root | unknown |
| PUT | `/o/authorize/` | `oauth2_provider.views.base.AuthorizationView.put` | audit / protocol/root | unknown |
| POST | `/o/token/` | `oauth2_provider.views.base.TokenView.post` | audit / protocol/root | unknown |
| POST | `/o/revoke_token/` | `oauth2_provider.views.base.RevokeTokenView.post` | audit / protocol/root | unknown |
| GET | `/o/introspect/` | `oauth2_provider.views.introspect.IntrospectTokenView.get` | audit / protocol/root | unknown |
| POST | `/o/introspect/` | `oauth2_provider.views.introspect.IntrospectTokenView.post` | audit / protocol/root | unknown |
| GET | `/o/applications/` | `oauth2_provider.views.application.ApplicationList.get` | audit / protocol/root | unknown |
| GET | `/o/applications/register/` | `oauth2_provider.views.application.ApplicationRegistration.get` | audit / protocol/root | unknown |
| POST | `/o/applications/register/` | `oauth2_provider.views.application.ApplicationRegistration.post` | audit / protocol/root | unknown |
| PUT | `/o/applications/register/` | `oauth2_provider.views.application.ApplicationRegistration.put` | audit / protocol/root | unknown |
| GET | `/o/applications/{pk}/` | `oauth2_provider.views.application.ApplicationDetail.get` | audit / protocol/root | unknown |
| GET | `/o/applications/{pk}/delete/` | `oauth2_provider.views.application.ApplicationDelete.get` | audit / protocol/root | unknown |
| POST | `/o/applications/{pk}/delete/` | `oauth2_provider.views.application.ApplicationDelete.post` | audit / protocol/root | unknown |
| DELETE | `/o/applications/{pk}/delete/` | `oauth2_provider.views.application.ApplicationDelete.delete` | audit / protocol/root | unknown |
| GET | `/o/applications/{pk}/update/` | `oauth2_provider.views.application.ApplicationUpdate.get` | audit / protocol/root | unknown |
| POST | `/o/applications/{pk}/update/` | `oauth2_provider.views.application.ApplicationUpdate.post` | audit / protocol/root | unknown |
| PUT | `/o/applications/{pk}/update/` | `oauth2_provider.views.application.ApplicationUpdate.put` | audit / protocol/root | unknown |
| GET | `/o/authorized_tokens/` | `oauth2_provider.views.token.AuthorizedTokensListView.get` | audit / protocol/root | unknown |
| GET | `/o/authorized_tokens/{pk}/delete/` | `oauth2_provider.views.token.AuthorizedTokenDeleteView.get` | audit / protocol/root | unknown |
| POST | `/o/authorized_tokens/{pk}/delete/` | `oauth2_provider.views.token.AuthorizedTokenDeleteView.post` | audit / protocol/root | unknown |
| DELETE | `/o/authorized_tokens/{pk}/delete/` | `oauth2_provider.views.token.AuthorizedTokenDeleteView.delete` | audit / protocol/root | unknown |
| GET | `/o/\.well-known/openid-configuration/?` | `oauth2_provider.views.oidc.ConnectDiscoveryInfoView.get` | audit / protocol/root | unknown |
| GET | `/o/\.well-known/jwks.json` | `oauth2_provider.views.oidc.JwksInfoView.get` | audit / protocol/root | unknown |
| GET | `/o/userinfo/` | `oauth2_provider.views.oidc.UserInfoView.get` | audit / protocol/root | unknown |
| POST | `/o/userinfo/` | `oauth2_provider.views.oidc.UserInfoView.post` | audit / protocol/root | unknown |
| GET | `/o/logout/` | `oauth2_provider.views.oidc.RPInitiatedLogoutView.get` | audit / protocol/root | unknown |
| POST | `/o/logout/` | `oauth2_provider.views.oidc.RPInitiatedLogoutView.post` | audit / protocol/root | unknown |
| PUT | `/o/logout/` | `oauth2_provider.views.oidc.RPInitiatedLogoutView.put` | audit / protocol/root | unknown |
| POST | `/api/v1/auth/password/admin-reset-links` | `apps.users.views.password_reset.AdminPasswordResetView.post` | canonical / existing | auth.repository.ts:issueAdminPasswordReset |
| POST | `/api/v1/auth/password/reset-requests` | `apps.users.views.password_reset.PasswordResetRequestView.post` | canonical / existing | auth.repository.ts:requestPasswordReset |
| POST | `/api/v1/auth/password/resets` | `apps.users.views.password_reset.PasswordResetCompleteView.post` | canonical / existing | auth.repository.ts:completePasswordReset |
| GET | `/api/v1/auth/providers` | `apps.users.views.auth.AuthOptionsView.get` | canonical / existing | auth.repository.ts:getAuthOptions |
| POST | `/api/v1/auth/register/password` | `apps.users.views.auth.RegisterView.post` | canonical / existing | auth.repository.ts:register |
| GET | `/api/v1/auth/login/{provider}` | `apps.users.views.auth.ProviderLoginView.get` | canonical / existing | unknown |
| POST | `/api/v1/auth/login/{provider}` | `apps.users.views.auth.ProviderLoginView.post` | canonical / existing | unknown |
| POST | `/api/v1/auth/callback/{provider}` | `apps.users.views.auth.OAuthCallbackView.post` | canonical / existing | auth.repository.ts:oauthCallback |
| POST | `/api/v1/auth/refresh` | `apps.users.views.token.TokenRefreshView.post` | canonical / existing | http.client.ts:isAuthSessionStorageEvent |
| POST | `/api/v1/auth/logout` | `apps.users.views.token.LogoutView.post` | canonical / existing | http.client.ts:getDeviceId; auth.repository.ts:logout |
| GET | `/api/v1/auth/sessions` | `apps.users.views.sessions.AuthSessionListView.get` | canonical / existing | auth.repository.ts:getAuthSessions |
| POST | `/api/v1/auth/sessions/logout-others` | `apps.users.views.sessions.LogoutOtherSessionsView.post` | canonical / existing | auth.repository.ts:logoutOtherSessions |
| GET | `/api/v1/users/` | `apps.users.views.admin.UserSearchView.get` | canonical / existing | user.repository.ts:searchUsers; user.repository.ts:searchUsers |
| GET | `/api/v1/users/summary` | `apps.users.views.admin.UserSummaryView.get` | canonical / existing | user.repository.ts:getUserSummary |
| GET | `/api/v1/users/me` | `apps.users.views.account.CurrentUserView.get` | canonical / existing | user.repository.ts:getCurrentUser; user.repository.ts:updateAccountProfile |
| PATCH | `/api/v1/users/me` | `apps.users.views.account.CurrentUserView.patch` | canonical / existing | user.repository.ts:getCurrentUser; user.repository.ts:updateAccountProfile |
| GET | `/api/v1/users/me/preferences` | `apps.users.views.preferences.UserPreferencesView.get` | canonical / existing | user.repository.ts:getPreferences; user.repository.ts:updatePreferences |
| PATCH | `/api/v1/users/me/preferences` | `apps.users.views.preferences.UserPreferencesView.patch` | canonical / existing | user.repository.ts:getPreferences; user.repository.ts:updatePreferences |
| POST | `/api/v1/users/me/avatar` | `apps.users.views.avatar.UserAvatarUploadView.post` | canonical / existing | user.repository.ts:uploadAvatar |
| PATCH | `/api/v1/users/{pk}/role` | `apps.users.views.admin.UserRoleUpdateView.patch` | canonical / existing | user.repository.ts:updateUserRole |
| POST | `/api/v1/action-links` | `apps.users.views.action_link.ActionLinkIssueView.post` | canonical / existing | auth.repository.ts:issueTeacherActivationActionLink |
| GET | `/api/v1/action-links/{token}` | `apps.users.views.action_link.ActionLinkInspectView.get` | canonical / existing | auth.repository.ts:inspectActionLink |
| POST | `/api/v1/action-links/{token}/redeem` | `apps.users.views.action_link.ActionLinkRedeemView.post` | canonical / existing | auth.repository.ts:redeemActionLink |
| POST | `/api/v1/markdown/images/` | `apps.core.views.markdown_images.MarkdownImageUploadView.post` | audit / F | markdown.repository.ts:uploadMarkdownImage |
| GET | `/api/v1/markdown/images/{object_key}` | `apps.core.views.markdown_images.MarkdownImageReadView.get` | audit / F | unknown |
| GET | `/api/v1/system/service-status` | `apps.core.views.service_status.ServiceStatusView.get` | canonical / F | serviceStatus.repository.ts:getServiceStatus |
| GET | `/api/v1/system/version` | `apps.core.views.system_version.SystemVersionView.get` | canonical / F | system.repository.ts:getSystemVersion |
| POST | `/api/v1/system/version/check` | `apps.core.views.system_version.SystemVersionCheckView.post` | canonical / F | system.repository.ts:checkSystemUpdates |
| POST | `/api/v1/system/upgrade` | `apps.core.views.system_version.SystemUpgradeView.post` | canonical / F | system.repository.ts:startSystemUpgrade |
| GET | `/api/v1/system/ingress` | `apps.core.views.system_version.SystemIngressView.get` | canonical / F | system.repository.ts:getIngress |
| GET | `/api/v1/management/problems/tags/` | `apps.problems.views.TagViewSet.list` | audit / B | unknown |
| POST | `/api/v1/management/problems/tags/` | `apps.problems.views.TagViewSet.create` | audit / B | unknown |
| GET | `/api/v1/management/problems/tags/{slug}/` | `apps.problems.views.TagViewSet.retrieve` | audit / B | unknown |
| PUT | `/api/v1/management/problems/tags/{slug}/` | `apps.problems.views.TagViewSet.update` | audit / B | unknown |
| PATCH | `/api/v1/management/problems/tags/{slug}/` | `apps.problems.views.TagViewSet.partial_update` | audit / B | unknown |
| DELETE | `/api/v1/management/problems/tags/{slug}/` | `apps.problems.views.TagViewSet.destroy` | audit / B | unknown |
| POST | `/api/v1/management/problems/{id}/test_run/` | `apps.problems.views.ProblemViewSet.test_run` | audit / B | server.py:qjudge_code_runner; server.py:qjudge_code_runner |
| GET | `/api/v1/management/problems/{id}/test_run_status/` | `apps.problems.views.ProblemViewSet.test_run_status` | audit / B | unknown |
| GET | `/api/v1/management/problems/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | unknown |
| GET | `/api/v1/submissions/` | `apps.submissions.views.SubmissionViewSet.list` | audit / B | submission.repository.ts:submitSolution |
| POST | `/api/v1/submissions/` | `apps.submissions.views.SubmissionViewSet.create` | audit / B | submission.repository.ts:submitSolution |
| GET | `/api/v1/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.retrieve` | audit / B | submission.repository.ts:getSubmission |
| PUT | `/api/v1/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.update` | audit / B | submission.repository.ts:getSubmission |
| PATCH | `/api/v1/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.partial_update` | audit / B | submission.repository.ts:getSubmission |
| DELETE | `/api/v1/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.destroy` | audit / B | submission.repository.ts:getSubmission |
| GET | `/api/v1/submissions/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | submission.repository.ts:submitSolution |
| POST | `/api/v1/internal/integrity/runs/{run_id}/finalize/` | `apps.contests.views.integrity_internal.IntegrityResidentFinalizeView.post` | audit / C/D/E | unknown |
| GET | `/api/v1/internal/integrity/resident/descriptors/` | `apps.contests.views.integrity_internal.IntegrityResidentDescriptorsView.get` | audit / C/D/E | unknown |
| POST | `/api/v1/internal/integrity/runs/{run_id}/commands/` | `apps.contests.views.integrity_internal.IntegrityCommandsView.post` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam/runtime-state/` | `apps.contests.views.exam_runtime_state.ExamRuntimeStateView.get` | audit / C/D/E | exam.repository.ts:getRuntimeState |
| GET | `/api/v1/contests/` | `apps.contests.views.contest.ContestViewSet.list` | audit / C/D/E | problemSeed.ts:findSeededContestProblem; server.py:qjudge_browse; api.py:grading_answers |
| POST | `/api/v1/contests/` | `apps.contests.views.contest.ContestViewSet.create` | audit / C/D/E | problemSeed.ts:findSeededContestProblem; server.py:qjudge_browse; api.py:grading_answers |
| GET | `/api/v1/contests/{pk}/` | `apps.contests.views.contest.ContestViewSet.retrieve` | audit / C/D/E | contest.repository.ts:getContest; contest.repository.ts:updateContest; contest.repository.ts:deleteContest; server.py:_ensure_contest_type; server.py:fetch_detail; server.py:fetch_detail; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager |
| PUT | `/api/v1/contests/{pk}/` | `apps.contests.views.contest.ContestViewSet.update` | audit / C/D/E | contest.repository.ts:getContest; contest.repository.ts:updateContest; contest.repository.ts:deleteContest; server.py:_ensure_contest_type; server.py:fetch_detail; server.py:fetch_detail; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager |
| PATCH | `/api/v1/contests/{pk}/` | `apps.contests.views.contest.ContestViewSet.partial_update` | audit / C/D/E | contest.repository.ts:getContest; contest.repository.ts:updateContest; contest.repository.ts:deleteContest; server.py:_ensure_contest_type; server.py:fetch_detail; server.py:fetch_detail; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager |
| DELETE | `/api/v1/contests/{pk}/` | `apps.contests.views.contest.ContestViewSet.destroy` | audit / C/D/E | contest.repository.ts:getContest; contest.repository.ts:updateContest; contest.repository.ts:deleteContest; server.py:_ensure_contest_type; server.py:fetch_detail; server.py:fetch_detail; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager; server.py:qjudge_contest_manager |
| GET | `/api/v1/contests/{pk}/anticheat-config/` | `apps.contests.views.contest.ContestViewSet.anticheat_config` | audit / C/D/E | contest.repository.ts:getContestAnticheatConfig |
| POST | `/api/v1/contests/{pk}/attendance/events/` | `apps.contests.views.contest.ContestViewSet.attendance_events` | audit / C/D/E | attendance.repository.ts:createAttendanceEvent |
| GET | `/api/v1/contests/{pk}/attendance/qr-token/` | `apps.contests.views.contest.ContestViewSet.attendance_qr_token` | audit / C/D/E | attendance.repository.ts:getAttendanceQrToken |
| POST | `/api/v1/contests/{pk}/attendance/validate/` | `apps.contests.views.contest.ContestViewSet.attendance_validate` | audit / C/D/E | attendance.repository.ts:validateAttendanceCredential |
| GET | `/api/v1/contests/{pk}/download/` | `apps.contests.views.contest.ContestViewSet.download` | audit / C/D/E | contestExports.repository.ts:downloadContestFile |
| GET | `/api/v1/contests/{pk}/export_results/` | `apps.contests.views.contest.ContestViewSet.export_results` | audit / C/D/E | contestExports.repository.ts:exportContestResults |
| GET | `/api/v1/contests/{pk}/my_report/` | `apps.contests.views.contest.ContestViewSet.my_report` | audit / C/D/E | contestExports.repository.ts:downloadMyReport |
| GET | `/api/v1/contests/{pk}/overview-metrics/` | `apps.contests.views.contest.ContestViewSet.overview_metrics` | audit / C/D/E | contest.repository.ts:getContestOverviewMetrics |
| GET | `/api/v1/contests/{pk}/participants/{user_id}/dashboard/` | `apps.contests.views.contest.ContestViewSet.participant_dashboard` | audit / C/D/E | contestParticipants.repository.ts:getParticipantDashboard |
| GET | `/api/v1/contests/{pk}/participants/{user_id}/report/` | `apps.contests.views.contest.ContestViewSet.participant_report` | audit / C/D/E | contestParticipants.repository.ts:downloadParticipantReport |
| GET | `/api/v1/contests/{pk}/participants/` | `apps.contests.views.contest.ContestViewSet.participants` | audit / C/D/E | contestParticipants.repository.ts:getContestParticipants |
| POST | `/api/v1/contests/{pk}/reopen_exam/` | `apps.contests.views.contest.ContestViewSet.reopen_exam` | audit / C/D/E | contestParticipants.repository.ts:reopenExam |
| POST | `/api/v1/contests/{pk}/participants/reset_exam_record/` | `apps.contests.views.contest.ContestViewSet.reset_exam_record` | audit / C/D/E | attendance.repository.ts:resetParticipantExamRecord |
| GET | `/api/v1/contests/{pk}/standings/` | `apps.contests.views.contest.ContestViewSet.standings` | audit / C/D/E | contest.repository.ts:getContestStandings |
| POST | `/api/v1/contests/{pk}/toggle_status/` | `apps.contests.views.contest.ContestViewSet.toggle_status` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{pk}/unlock_participant/` | `apps.contests.views.contest.ContestViewSet.unlock_participant` | audit / C/D/E | contestParticipants.repository.ts:unlockParticipant |
| PATCH | `/api/v1/contests/{pk}/update_participant/` | `apps.contests.views.contest.ContestViewSet.update_participant` | audit / C/D/E | contestParticipants.repository.ts:updateParticipant |
| GET | `/api/v1/contests/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | problemSeed.ts:findSeededContestProblem; server.py:qjudge_browse; api.py:grading_answers |
| GET | `/api/v1/contests/{contest_pk}/exam-paper/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.list` | audit / C/D/E | examPaper.repository.ts:getExamPaper; examPaper.repository.ts:createExamPaperBlock; examPaper.repository.ts:reorderExamPaperBlocks |
| POST | `/api/v1/contests/{contest_pk}/exam-paper/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.create` | audit / C/D/E | examPaper.repository.ts:getExamPaper; examPaper.repository.ts:createExamPaperBlock; examPaper.repository.ts:reorderExamPaperBlocks |
| PATCH | `/api/v1/contests/{contest_pk}/exam-paper/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.partial_update_collection` | audit / C/D/E | examPaper.repository.ts:getExamPaper; examPaper.repository.ts:createExamPaperBlock; examPaper.repository.ts:reorderExamPaperBlocks |
| GET | `/api/v1/contests/{contest_pk}/exam-paper/{pk}/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.retrieve` | audit / C/D/E | examPaper.repository.ts:updateExamPaperBlock; examPaper.repository.ts:deleteExamPaperBlock |
| PATCH | `/api/v1/contests/{contest_pk}/exam-paper/{pk}/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.partial_update` | audit / C/D/E | examPaper.repository.ts:updateExamPaperBlock; examPaper.repository.ts:deleteExamPaperBlock |
| DELETE | `/api/v1/contests/{contest_pk}/exam-paper/{pk}/` | `apps.contests.views.exam_paper.ContestExamPaperViewSet.destroy` | audit / C/D/E | examPaper.repository.ts:updateExamPaperBlock; examPaper.repository.ts:deleteExamPaperBlock |
| GET | `/api/v1/contests/{contest_pk}/announcements/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.list` | audit / C/D/E | contestAnnouncements.repository.ts:getContestAnnouncements; contestAnnouncements.repository.ts:createContestAnnouncement |
| POST | `/api/v1/contests/{contest_pk}/announcements/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.create` | audit / C/D/E | contestAnnouncements.repository.ts:getContestAnnouncements; contestAnnouncements.repository.ts:createContestAnnouncement |
| GET | `/api/v1/contests/{contest_pk}/announcements/{pk}/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.retrieve` | audit / C/D/E | contestAnnouncements.repository.ts:deleteContestAnnouncement |
| PUT | `/api/v1/contests/{contest_pk}/announcements/{pk}/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.update` | audit / C/D/E | contestAnnouncements.repository.ts:deleteContestAnnouncement |
| PATCH | `/api/v1/contests/{contest_pk}/announcements/{pk}/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.partial_update` | audit / C/D/E | contestAnnouncements.repository.ts:deleteContestAnnouncement |
| DELETE | `/api/v1/contests/{contest_pk}/announcements/{pk}/` | `apps.contests.views.announcement.ContestAnnouncementViewSet.destroy` | audit / C/D/E | contestAnnouncements.repository.ts:deleteContestAnnouncement |
| GET | `/api/v1/contests/{contest_pk}/grade-appeals/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.list` | action-errors / C/D/E | gradeAppeals.repository.ts:module |
| POST | `/api/v1/contests/{contest_pk}/grade-appeals/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.create` | action-errors / C/D/E | gradeAppeals.repository.ts:module |
| GET | `/api/v1/contests/{contest_pk}/grade-appeals/{pk}/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.retrieve` | action-errors / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/grade-appeals/{pk}/close/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.close` | action-errors / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/grade-appeals/{pk}/messages/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.messages` | action-errors / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/grade-appeals/{pk}/reopen/` | `apps.contests.views.grade_appeal.GradeAppealViewSet.reopen` | action-errors / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam/attendance/evidence/confirm/` | `apps.contests.views.exam_lifecycle.ExamViewSet.attendance_evidence_confirm` | audit / C/D/E | exam.repository.ts:confirmAttendanceEvidence |
| POST | `/api/v1/contests/{contest_pk}/exam/attendance/evidence/intents/` | `apps.contests.views.exam_lifecycle.ExamViewSet.attendance_evidence_intents` | audit / C/D/E | exam.repository.ts:createAttendanceEvidenceIntent |
| POST | `/api/v1/contests/{contest_pk}/exam/end/` | `apps.contests.views.exam_lifecycle.ExamViewSet.end_exam` | audit / C/D/E | exam.repository.ts:endExam |
| GET | `/api/v1/contests/{contest_pk}/exam/events/` | `apps.contests.views.exam_lifecycle.ExamViewSet.events` | audit / C/D/E | exam.repository.ts:getExamEvents |
| POST | `/api/v1/contests/{contest_pk}/exam/integrity/checkpoints/` | `apps.contests.views.exam_lifecycle.ExamViewSet.integrity_checkpoints` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam/integrity/evidence/review/` | `apps.contests.views.exam_lifecycle.ExamViewSet.integrity_evidence_review` | audit / C/D/E | exam.repository.ts:getIntegrityEvidenceReview |
| GET | `/api/v1/contests/{contest_pk}/exam/live/config/` | `apps.contests.views.exam_lifecycle.ExamViewSet.live_config` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam/live/targets/` | `apps.contests.views.exam_lifecycle.ExamViewSet.live_targets` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam/live/token/` | `apps.contests.views.exam_lifecycle.ExamViewSet.live_token` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam/start/` | `apps.contests.views.exam_lifecycle.ExamViewSet.start_exam` | audit / C/D/E | exam.repository.ts:startExam |
| GET | `/api/v1/contests/{contest_pk}/problems/` | `apps.contests.views.problem.ContestProblemViewSet.list` | audit / C/D/E | contestProblems.repository.ts:createContestProblem; problemSeed.ts:findSeededContestProblem; server.py:qjudge_contest_manager; server.py:_attach_warnings |
| POST | `/api/v1/contests/{contest_pk}/problems/` | `apps.contests.views.problem.ContestProblemViewSet.create` | audit / C/D/E | contestProblems.repository.ts:createContestProblem; problemSeed.ts:findSeededContestProblem; server.py:qjudge_contest_manager; server.py:_attach_warnings |
| POST | `/api/v1/contests/{contest_pk}/problems/duplicate/` | `apps.contests.views.problem.ContestProblemViewSet.duplicate` | audit / C/D/E | contestProblems.repository.ts:duplicateContestProblem |
| POST | `/api/v1/contests/{contest_pk}/problems/import-from-bank/` | `apps.contests.views.problem.ContestProblemViewSet.import_from_bank` | audit / C/D/E | contestProblems.repository.ts:importContestProblemsFromBank |
| POST | `/api/v1/contests/{contest_pk}/problems/reorder/` | `apps.contests.views.problem.ContestProblemViewSet.reorder` | audit / C/D/E | contestProblems.repository.ts:reorderContestProblems; server.py:qjudge_contest_manager |
| GET | `/api/v1/contests/{contest_pk}/problems/{pk}/` | `apps.contests.views.problem.ContestProblemViewSet.retrieve` | audit / C/D/E | contestProblems.repository.ts:getContestProblem; contestProblems.repository.ts:patchContestProblem; contestProblems.repository.ts:removeContestProblem; server.py:_attach_warnings; server.py:_attach_warnings; server.py:_attach_warnings |
| PUT | `/api/v1/contests/{contest_pk}/problems/{pk}/` | `apps.contests.views.problem.ContestProblemViewSet.update` | audit / C/D/E | contestProblems.repository.ts:getContestProblem; contestProblems.repository.ts:patchContestProblem; contestProblems.repository.ts:removeContestProblem; server.py:_attach_warnings; server.py:_attach_warnings; server.py:_attach_warnings |
| PATCH | `/api/v1/contests/{contest_pk}/problems/{pk}/` | `apps.contests.views.problem.ContestProblemViewSet.partial_update` | audit / C/D/E | contestProblems.repository.ts:getContestProblem; contestProblems.repository.ts:patchContestProblem; contestProblems.repository.ts:removeContestProblem; server.py:_attach_warnings; server.py:_attach_warnings; server.py:_attach_warnings |
| DELETE | `/api/v1/contests/{contest_pk}/problems/{pk}/` | `apps.contests.views.problem.ContestProblemViewSet.destroy` | audit / C/D/E | contestProblems.repository.ts:getContestProblem; contestProblems.repository.ts:patchContestProblem; contestProblems.repository.ts:removeContestProblem; server.py:_attach_warnings; server.py:_attach_warnings; server.py:_attach_warnings |
| PATCH | `/api/v1/contests/{contest_pk}/problems/{pk}/score/` | `apps.contests.views.problem.ContestProblemViewSet.update_score` | audit / C/D/E | contestProblems.repository.ts:updateContestProblemScore |
| GET | `/api/v1/contests/{contest_pk}/exam-questions/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.list` | audit / C/D/E | server.py:qjudge_contest_manager; api.py:list_subjective_questions |
| POST | `/api/v1/contests/{contest_pk}/exam-questions/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.create` | audit / C/D/E | server.py:qjudge_contest_manager; api.py:list_subjective_questions |
| GET | `/api/v1/contests/{contest_pk}/exam-questions/export-paper/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.export_paper` | audit / C/D/E | contestExports.repository.ts:downloadExamPaperFile |
| POST | `/api/v1/contests/{contest_pk}/exam-questions/import-from-bank/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.import_from_bank` | audit / C/D/E | examQuestions.repository.ts:importExamQuestionsFromBank |
| POST | `/api/v1/contests/{contest_pk}/exam-questions/reorder/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.reorder` | audit / C/D/E | server.py:qjudge_contest_manager |
| GET | `/api/v1/contests/{contest_pk}/exam-questions/{pk}/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.retrieve` | audit / C/D/E | examQuestions.repository.ts:getExamQuestions; api.py:exam_question |
| PUT | `/api/v1/contests/{contest_pk}/exam-questions/{pk}/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.update` | audit / C/D/E | examQuestions.repository.ts:getExamQuestions; api.py:exam_question |
| PATCH | `/api/v1/contests/{contest_pk}/exam-questions/{pk}/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.partial_update` | audit / C/D/E | examQuestions.repository.ts:getExamQuestions; api.py:exam_question |
| DELETE | `/api/v1/contests/{contest_pk}/exam-questions/{pk}/` | `apps.contests.views.exam_question.ContestExamQuestionViewSet.destroy` | audit / C/D/E | examQuestions.repository.ts:getExamQuestions; api.py:exam_question |
| GET | `/api/v1/contests/{contest_pk}/submissions/` | `apps.submissions.views.SubmissionViewSet.list` | audit / B | unknown |
| POST | `/api/v1/contests/{contest_pk}/submissions/` | `apps.submissions.views.SubmissionViewSet.create` | audit / B | unknown |
| GET | `/api/v1/contests/{contest_pk}/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.retrieve` | audit / B | unknown |
| PUT | `/api/v1/contests/{contest_pk}/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.update` | audit / B | unknown |
| PATCH | `/api/v1/contests/{contest_pk}/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.partial_update` | audit / B | unknown |
| DELETE | `/api/v1/contests/{contest_pk}/submissions/{pk}/` | `apps.submissions.views.SubmissionViewSet.destroy` | audit / B | unknown |
| GET | `/api/v1/contests/{contest_pk}/activities/` | `apps.contests.views.activity.ContestActivityViewSet.list` | audit / C/D/E | exam.repository.ts:getContestActivities |
| GET | `/api/v1/contests/{contest_pk}/activities/{pk}/` | `apps.contests.views.activity.ContestActivityViewSet.retrieve` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/all-answers/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.all_answers` | action-errors / C/D/E | examAnswers.repository.ts:getAllExamAnswersForGrading |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/batch-grade/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.batch_grade` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/batch-writes/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.batch_writes` | audit / C/D/E | examAnswers.repository.ts:getBatchGradeWrites |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/dashboard-summary/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.dashboard_summary` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/grading-draft/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_draft` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/grading-export/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_export` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/grading-progress/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_progress` | audit / C/D/E | examAnswers.repository.ts:getGradingProgress |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/grading-submit/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_submit` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/grading-unit/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_unit` | audit / C/D/E | examAnswers.repository.ts:getGradingUnit |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/grading-unit/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_unit` | audit / C/D/E | examAnswers.repository.ts:getGradingUnit |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/grading-verify/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grading_verify` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/my-answers/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.my_answers` | audit / C/D/E | examAnswers.repository.ts:getMyExamAnswers |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/question-detail/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.question_detail` | audit / C/D/E | exam.repository.ts:getExamDashboardQuestionDetail |
| GET | `/api/v1/contests/{contest_pk}/exam-answers/results/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.results` | action-errors / C/D/E | examAnswers.repository.ts:getExamResults |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/submit/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.submit_answer` | audit / C/D/E | examAnswers.repository.ts:submitExamAnswer |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/{pk}/grade/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.grade_answer` | audit / C/D/E | examAnswers.repository.ts:gradeExamAnswer |
| POST | `/api/v1/contests/{contest_pk}/exam-answers/{pk}/ungrade/` | `apps.contests.views.exam_answer.ExamAnswerViewSet.ungrade_answer` | audit / C/D/E | examAnswers.repository.ts:ungradeExamAnswer |
| GET | `/api/v1/contests/{contest_pk}/exam-question-groups/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.list` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam-question-groups/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.create` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/exam-question-groups/reorder/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.reorder` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/exam-question-groups/{pk}/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.retrieve` | audit / C/D/E | unknown |
| PUT | `/api/v1/contests/{contest_pk}/exam-question-groups/{pk}/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.update` | audit / C/D/E | unknown |
| PATCH | `/api/v1/contests/{contest_pk}/exam-question-groups/{pk}/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.partial_update` | audit / C/D/E | unknown |
| DELETE | `/api/v1/contests/{contest_pk}/exam-question-groups/{pk}/` | `apps.contests.views.exam_question_group.ContestExamQuestionGroupViewSet.destroy` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/integrity-runs/` | `apps.contests.views.integrity_runs.IntegrityRunViewSet.list` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/integrity-runs/` | `apps.contests.views.integrity_runs.IntegrityRunViewSet.create` | audit / C/D/E | unknown |
| GET | `/api/v1/contests/{contest_pk}/integrity-runs/{pk}/` | `apps.contests.views.integrity_runs.IntegrityRunViewSet.retrieve` | audit / C/D/E | unknown |
| POST | `/api/v1/contests/{contest_pk}/integrity-runs/{pk}/purge/` | `apps.contests.views.integrity_runs.IntegrityRunViewSet.purge` | audit / C/D/E | unknown |
| GET | `/api/v1/classrooms/` | `apps.classrooms.views.ClassroomViewSet.list` | canonical / A | classroom.repository.ts:createClassroom; server.py:qjudge_browse; server.py:qjudge_browse; server.py:qjudge_browse; api.py:list_classrooms |
| POST | `/api/v1/classrooms/` | `apps.classrooms.views.ClassroomViewSet.create` | canonical / A | classroom.repository.ts:createClassroom; server.py:qjudge_browse; server.py:qjudge_browse; server.py:qjudge_browse; api.py:list_classrooms |
| GET | `/api/v1/classrooms/{id}/` | `apps.classrooms.views.ClassroomViewSet.retrieve` | canonical / A | classroom.repository.ts:getClassroom; classroom.repository.ts:updateClassroom; classroom.repository.ts:deleteClassroom; server.py:qjudge_browse |
| PUT | `/api/v1/classrooms/{id}/` | `apps.classrooms.views.ClassroomViewSet.update` | canonical / A | classroom.repository.ts:getClassroom; classroom.repository.ts:updateClassroom; classroom.repository.ts:deleteClassroom; server.py:qjudge_browse |
| PATCH | `/api/v1/classrooms/{id}/` | `apps.classrooms.views.ClassroomViewSet.partial_update` | canonical / A | classroom.repository.ts:getClassroom; classroom.repository.ts:updateClassroom; classroom.repository.ts:deleteClassroom; server.py:qjudge_browse |
| DELETE | `/api/v1/classrooms/{id}/` | `apps.classrooms.views.ClassroomViewSet.destroy` | canonical / A | classroom.repository.ts:getClassroom; classroom.repository.ts:updateClassroom; classroom.repository.ts:deleteClassroom; server.py:qjudge_browse |
| PATCH | `/api/v1/classrooms/{id}/announcements/{ann_id}/` | `apps.classrooms.views.ClassroomViewSet.announcement_detail` | canonical / A | classroom.repository.ts:updateAnnouncement; classroom.repository.ts:deleteAnnouncement |
| DELETE | `/api/v1/classrooms/{id}/announcements/{ann_id}/` | `apps.classrooms.views.ClassroomViewSet.announcement_detail` | canonical / A | classroom.repository.ts:updateAnnouncement; classroom.repository.ts:deleteAnnouncement |
| GET | `/api/v1/classrooms/{id}/announcements/` | `apps.classrooms.views.ClassroomViewSet.announcements` | canonical / A | classroom.repository.ts:createAnnouncement |
| POST | `/api/v1/classrooms/{id}/announcements/` | `apps.classrooms.views.ClassroomViewSet.announcements` | canonical / A | classroom.repository.ts:createAnnouncement |
| POST | `/api/v1/classrooms/{id}/cover/` | `apps.classrooms.views.ClassroomViewSet.cover` | canonical / A | classroom.repository.ts:uploadClassroomCover |
| GET | `/api/v1/classrooms/{id}/gradebook/` | `apps.classrooms.views.ClassroomViewSet.gradebook` | canonical / A | classroom.repository.ts:getClassroomGradebook |
| GET | `/api/v1/classrooms/{id}/gradebook/export/` | `apps.classrooms.views.ClassroomViewSet.gradebook_export` | audit / A | classroom.repository.ts:exportClassroomGradebook |
| POST | `/api/v1/classrooms/{id}/invite-code/` | `apps.classrooms.views.ClassroomViewSet.invite_code` | canonical / A | classroom.repository.ts:regenerateCode |
| GET | `/api/v1/classrooms/{id}/contests/` | `apps.classrooms.views.ClassroomViewSet.list_contests` | canonical / A | classroom.repository.ts:createClassroomContest; server.py:qjudge_browse; server.py:qjudge_browse; server.py:qjudge_contest_manager; api.py:list_classroom_exams |
| POST | `/api/v1/classrooms/{id}/contests/` | `apps.classrooms.views.ClassroomViewSet.list_contests` | canonical / A | classroom.repository.ts:createClassroomContest; server.py:qjudge_browse; server.py:qjudge_browse; server.py:qjudge_contest_manager; api.py:list_classroom_exams |
| PATCH | `/api/v1/classrooms/{id}/members/{member_user_id}/` | `apps.classrooms.views.ClassroomViewSet.member_detail` | canonical / A | classroom.repository.ts:removeMember; classroom.repository.ts:updateMemberRole |
| DELETE | `/api/v1/classrooms/{id}/members/{member_user_id}/` | `apps.classrooms.views.ClassroomViewSet.member_detail` | canonical / A | classroom.repository.ts:removeMember; classroom.repository.ts:updateMemberRole |
| GET | `/api/v1/classrooms/{id}/members/` | `apps.classrooms.views.ClassroomViewSet.members` | canonical / A | classroom.repository.ts:addMembers |
| POST | `/api/v1/classrooms/{id}/members/` | `apps.classrooms.views.ClassroomViewSet.members` | canonical / A | classroom.repository.ts:addMembers |
| GET | `/api/v1/classrooms/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | classroom.repository.ts:createClassroom; server.py:qjudge_browse; server.py:qjudge_browse; server.py:qjudge_browse; api.py:list_classrooms |
| GET | `/api/v1/question-banks/` | `apps.question_bank.views.QuestionBankViewSet.list` | audit / B | questionBank.repository.ts:getQuestionBanks; questionBank.repository.ts:create |
| POST | `/api/v1/question-banks/` | `apps.question_bank.views.QuestionBankViewSet.create` | audit / B | questionBank.repository.ts:getQuestionBanks; questionBank.repository.ts:create |
| GET | `/api/v1/question-banks/inbox/` | `apps.question_bank.views.QuestionBankViewSet.inbox` | audit / B | unknown |
| POST | `/api/v1/question-banks/inbox/ingest/` | `apps.question_bank.views.QuestionBankViewSet.ingest_inbox` | audit / B | questionBank.repository.ts:ingestInbox |
| GET | `/api/v1/question-banks/{uuid}/` | `apps.question_bank.views.QuestionBankViewSet.retrieve` | audit / B | questionBank.repository.ts:getBank; questionBank.repository.ts:update |
| PUT | `/api/v1/question-banks/{uuid}/` | `apps.question_bank.views.QuestionBankViewSet.update` | audit / B | questionBank.repository.ts:getBank; questionBank.repository.ts:update |
| PATCH | `/api/v1/question-banks/{uuid}/` | `apps.question_bank.views.QuestionBankViewSet.partial_update` | audit / B | questionBank.repository.ts:getBank; questionBank.repository.ts:update |
| DELETE | `/api/v1/question-banks/{uuid}/` | `apps.question_bank.views.QuestionBankViewSet.destroy` | audit / B | questionBank.repository.ts:getBank; questionBank.repository.ts:update |
| POST | `/api/v1/question-banks/{uuid}/questions/{question_id}/clone-to-my-bank/` | `apps.question_bank.views.QuestionBankViewSet.clone_question_to_my_bank` | audit / B | unknown |
| GET | `/api/v1/question-banks/{uuid}/questions/{question_id}/` | `apps.question_bank.views.QuestionBankViewSet.question_detail` | audit / B | questionBank.repository.ts:updateQuestion; questionBank.repository.ts:deleteQuestion |
| PATCH | `/api/v1/question-banks/{uuid}/questions/{question_id}/` | `apps.question_bank.views.QuestionBankViewSet.question_detail` | audit / B | questionBank.repository.ts:updateQuestion; questionBank.repository.ts:deleteQuestion |
| DELETE | `/api/v1/question-banks/{uuid}/questions/{question_id}/` | `apps.question_bank.views.QuestionBankViewSet.question_detail` | audit / B | questionBank.repository.ts:updateQuestion; questionBank.repository.ts:deleteQuestion |
| GET | `/api/v1/question-banks/{uuid}/questions/` | `apps.question_bank.views.QuestionBankViewSet.questions` | audit / B | questionBank.repository.ts:listQuestions; questionBank.repository.ts:createQuestion |
| POST | `/api/v1/question-banks/{uuid}/questions/` | `apps.question_bank.views.QuestionBankViewSet.questions` | audit / B | questionBank.repository.ts:listQuestions; questionBank.repository.ts:createQuestion |
| POST | `/api/v1/question-banks/{uuid}/upload_cover/` | `apps.question_bank.views.QuestionBankViewSet.upload_cover` | audit / B | questionBank.repository.ts:uploadCover |
| GET | `/api/v1/question-banks/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | questionBank.repository.ts:getQuestionBanks; questionBank.repository.ts:create |
| GET | `/api/v1/ai/sessions/` | `apps.ai.views.SessionViewSet.list` | audit / F | unknown |
| POST | `/api/v1/ai/sessions/` | `apps.ai.views.SessionViewSet.create` | audit / F | unknown |
| POST | `/api/v1/ai/sessions/new_session/` | `apps.ai.views.SessionViewSet.new_session` | audit / F | api.py:create_ai_session |
| GET | `/api/v1/ai/sessions/{pk}/` | `apps.ai.views.SessionViewSet.retrieve` | audit / F | api.py:patch_ai_session_context |
| PUT | `/api/v1/ai/sessions/{pk}/` | `apps.ai.views.SessionViewSet.update` | audit / F | api.py:patch_ai_session_context |
| PATCH | `/api/v1/ai/sessions/{pk}/` | `apps.ai.views.SessionViewSet.partial_update` | audit / F | api.py:patch_ai_session_context |
| DELETE | `/api/v1/ai/sessions/{pk}/` | `apps.ai.views.SessionViewSet.destroy` | audit / F | api.py:patch_ai_session_context |
| GET | `/api/v1/ai/sessions/{pk}/context/` | `apps.ai.views.SessionViewSet.context` | audit / F | unknown |
| POST | `/api/v1/ai/sessions/{pk}/rename/` | `apps.ai.views.SessionViewSet.rename` | audit / F | unknown |
| POST | `/api/v1/ai/sessions/{pk}/runs/` | `apps.ai.views.SessionViewSet.runs` | audit / F | api.py:start_ai_run |
| GET | `/api/v1/ai/runs/` | `apps.ai.views.ChatRunViewSet.list` | audit / F | unknown |
| GET | `/api/v1/ai/runs/{pk}/` | `apps.ai.views.ChatRunViewSet.retrieve` | audit / F | unknown |
| POST | `/api/v1/ai/runs/{pk}/answer/` | `apps.ai.views.ChatRunViewSet.answer` | audit / F | unknown |
| POST | `/api/v1/ai/runs/{pk}/approval/` | `apps.ai.views.ChatRunViewSet.approval` | audit / F | unknown |
| POST | `/api/v1/ai/runs/{pk}/cancel/` | `apps.ai.views.ChatRunViewSet.cancel` | audit / F | unknown |
| GET | `/api/v1/ai/runs/{pk}/events/` | `apps.ai.views.ChatRunViewSet.events` | audit / F | unknown |
| GET | `/api/v1/ai/artifacts/` | `apps.ai.artifact_views.ArtifactViewSet.list` | audit / F | api.py:list_artifacts |
| POST | `/api/v1/ai/artifacts/upload/` | `apps.ai.artifact_views.ArtifactViewSet.upload` | audit / F | api.py:upload_artifact |
| GET | `/api/v1/ai/artifacts/{pk}/` | `apps.ai.artifact_views.ArtifactViewSet.retrieve` | audit / F | unknown |
| GET | `/api/v1/ai/artifacts/{pk}/content/` | `apps.ai.artifact_views.ArtifactViewSet.content` | audit / F | api.py:artifact_content |
| GET | `/api/v1/ai/artifacts/{pk}/download/` | `apps.ai.artifact_views.ArtifactViewSet.download` | audit / F | unknown |
| GET | `/api/v1/ai/` | `rest_framework.routers.APIRootView.get` | audit / protocol/root | unknown |
| GET | `/api/v1/ai/models/` | `apps.ai.views.ModelListView.get` | audit / F | api.py:list_models |
| GET | `/api/schema/` | `drf_spectacular.views.SpectacularAPIView.get` | audit / protocol/root | unknown |
| GET | `/api/schema/swagger-ui/` | `drf_spectacular.views.SpectacularSwaggerView.get` | audit / protocol/root | unknown |
| GET | `/api/schema/redoc/` | `drf_spectacular.views.SpectacularRedocView.get` | audit / protocol/root | unknown |

## 協定與非 JSON 邊界

`/o/*` 與 OAuth discovery/token/revoke/authorize/introspection 保留 OAuth 協定；health probe、`/api/schema/*`、router API roots 不是 application DTO 遷移項目。根路徑 landing Markdown 與 Markdown image read、CSV/PDF/artifact content downloads、AI run events SSE、live/integrity signed transport 必須逐 action 排除；不能按 contests/ai prefix 全包。

## 本批交付與驗證

- 所有課堂 JSON actions 直接回 envelope；DELETE 回 200 + data:null。CSV body、Content-Type、Content-Disposition 保留，下載錯誤仍沿用下載協定。
- Frontend classroom.repository 使用 fetchEnvelope；列表讀完 meta.pagination 的分頁，刪除也解析 acknowledgement。getClassroom 非 2xx 回 undefined 的 UI 語意保留。未加入 header 或舊格式 fallback。
- MCP 課堂 browse 與 contest_manager create 明確解包，工具輸出保持原語意；其他尚未遷移 domain 不受影響。
- CLI 課堂列表與課堂考試使用嚴格契約解析，列表讀取所有分頁；格式錯誤不回假空集合。
- Backend wire tests：19 個操作的認證錯誤、實際 CRUD／成員／公告／競賽／成績簿、分頁、validation、403、404、200 null、CSV；共用 renderer 測試避免雙包與誤判業務 data/meta。
- Frontend：實際 fetch 回應解析與 DTO、錯誤、空集合、拒絕舊格式、下載。MCP：MockTransport 驗證分頁、詳細資料、create 恰一次與 malformed。CLI：分頁、空集合及 malformed。
- OpenAPI：課堂成功／錯誤／分頁／201／DELETE 200／CSV 單一契約，schema validation。生成時也修正原有 OAuth 文件設定的空 URL；不變更 OAuth runtime。snapshot 只更新課堂 paths、所需新增 components 與 OAuth URLs，保留其他領域既有 snapshot，避免夾帶其他 schema 漂移。

## 後續批次

B–F 每批先完成人工 endpoint/caller audit，再於同一 PR 修改後端、全部已知呼叫端、fixtures 與 schema。測試與 build 通過後才提 PR；直接切換單一格式，不新增暫時 header 或雙格式分支。發布與回滾均以同一批 server/client 版本為單位。
