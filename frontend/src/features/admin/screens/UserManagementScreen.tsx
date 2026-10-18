import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Copy,
} from "@carbon/icons-react";
import {
  TextInput,
  Button,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Select,
  SelectItem,
  Modal,
  TableContainer,
  Tag,
  InlineNotification,
  Tile,
  ButtonSet,
} from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";
import ContainerCard from "@/shared/layout/ContainerCard";
import styles from "./AdminScreens.module.scss";
import {
  issueTeacherActivationActionLink,
  issueAdminPasswordReset,
} from "@/infrastructure/api/repositories/auth.repository";
import {
  searchUsers,
  getUserSummary,
  updateUserRole,
} from "@/infrastructure/api/repositories/user.repository";
import type { ManagedUser, UserSummary } from "@/core/entities/auth.entity";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import { useCopyText } from "@/shared/hooks";

const UserManagementScreen = () => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [newRole, setNewRole] = useState<ManagedUser["role"]>("student");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [issuingInvite, setIssuingInvite] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>("all");
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [latestInviteExpiresAt, setLatestInviteExpiresAt] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ user: string; url: string; minutes: number } | null>(null);
  const [issuingReset, setIssuingReset] = useState(false);
  const { isCopied: resetCopied, copy: copyReset } = useCopyText();
  const { isCopied, copy } = useCopyText();

  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const loadSummary = useCallback(async () => {
    setSummary(null);
    setSummaryFailed(false);
    try {
      setSummary(await getUserSummary());
    } catch {
      setSummaryFailed(true);
    }
  }, []);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  const loadAllUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await searchUsers(""); // The recent-user list is capped by the API.
      if (response.data) {
        setUsers(response.data);
      } else {
        setError(t("user.management.loadFailed"));
      }
    } catch (err: unknown) {
      setError(err instanceof EnvelopeError ? err.message : t("user.management.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Load all users on mount and when the translated error copy changes.
  useEffect(() => {
    void loadAllUsers();
  }, [loadAllUsers]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, reload all users
      loadAllUsers();
      return;
    }

    if (searchQuery.length < 2) {
      setError(t("user.management.minSearchLength"));
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await searchUsers(searchQuery);
      if (response.data) {
        setUsers(response.data);
        if (response.data.length === 0) {
          setError(t("user.management.noUsersFound"));
        }
      } else {
        setError(t("user.management.searchFailed"));
      }
    } catch (err: unknown) {
      setError(err instanceof EnvelopeError ? err.message : t("user.management.searchFailedRetry"));
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChangeClick = (user: ManagedUser, role: ManagedUser["role"]) => {
    if (user.role === role) return;
    setSelectedUser(user);
    setNewRole(role);
    setConfirmModalOpen(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!selectedUser) return;

    setUpdating(true);
    try {
      const response = await updateUserRole(selectedUser.id, newRole);
      if (response.data) {
        setSuccess(tc("message.success"));
        // Update user in list
        setUsers(
          users.map((u) =>
            u.id === selectedUser.id ? { ...u, role: newRole } : u
          )
        );
        setConfirmModalOpen(false);
        void loadSummary();
      } else {
        setError(t("user.management.updateFailed"));
      }
    } catch (err: unknown) {
      setError(err instanceof EnvelopeError ? err.message : t("user.management.updateFailedRetry"));
    } finally {
      setUpdating(false);
    }
  };

  const handleIssueInvite = async () => {
    setIssuingInvite(true);
    setError("");
    setSuccess("");

    try {
      const response = await issueTeacherActivationActionLink("");
      setSuccess(t("user.management.activationInvite.sent", "已產生教師開通連結"));
      setLatestInviteUrl(response.data.activation_url || response.data.action_link_url || "");
      setLatestInviteExpiresAt(response.data.expires_at || null);
      await loadAllUsers();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message
        ? err.message
        : t("user.management.activationInvite.failed", "產生教師開通連結失敗"));
    } finally {
      setIssuingInvite(false);
    }
  };

  const handleIssueReset = async (user: ManagedUser) => {
    setIssuingReset(true);
    setError("");
    setResetLink(null);
    try {
      const { data } = await issueAdminPasswordReset(user.id);
      setResetLink({ user: user.username, url: data.reset_url, minutes: Math.ceil(data.expires_in / 60) });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("user.management.passwordReset.failed"));
    } finally {
      setIssuingReset(false);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      student: t("user.role.student"),
      teacher: t("user.role.teacher"),
      admin: t("user.role.adminTA"),
    };
    return labels[role] || role;
  };

  const getProviderLabel = (provider?: string) => {
    if (!provider) return t("user.management.loginMethods.unknown");
    const labels: Record<string, string> = {
      email: t("user.management.loginMethods.email"),
      password: t("user.management.loginMethods.password"),
      "nycu-oauth": t("user.management.loginMethods.sso"),
      google: t("user.management.loginMethods.google"),
      github: t("user.management.loginMethods.github"),
    };
    return labels[provider] || provider;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return t("user.management.notAvailable", "尚無資料");
    return new Date(value).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredUsers = users.filter((user) => {
    if (roleFilter === "all") return true;
    return user.role === roleFilter;
  });


  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader
          title={t("user.management.title")}
          subtitle={t("user.management.description")}
        />

        {summaryFailed && <p role="status">{t("system.overview.loadFailed", "無法讀取")}</p>}
        <div className={styles.statTileRow}>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.totalUsers", "總使用者")}
            </p>
            <strong className={styles.statValue}>{summary?.total ?? "—"}</strong>
          </Tile>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.teachers", "已開通教師")}
            </p>
            <strong className={styles.statValue}>{summary?.teachers ?? "—"}</strong>
          </Tile>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.pendingOnboarding", "未完成 onboarding")}
            </p>
            <strong className={styles.statValue}>{summary?.pendingOnboarding ?? "—"}</strong>
          </Tile>
        </div>

        <Modal open={resetLink !== null} passiveModal
          modalHeading={t("user.management.passwordReset.title", "密碼重設連結")}
          onRequestClose={() => setResetLink(null)}>
          {resetLink && <>
            <p>{t("user.management.passwordReset.description", { user: resetLink.user, minutes: resetLink.minutes })}</p>
            <TextInput id="admin-password-reset-link" readOnly value={resetLink.url}
              labelText={t("user.management.passwordReset.title", "密碼重設連結")} />
            <Button kind="tertiary" renderIcon={Copy} onClick={() => copyReset(resetLink.url)}>
              {resetCopied ? t("user.management.activationInvite.copied", "已複製") : t("user.management.activationInvite.copy", "複製連結")}
            </Button>
          </>}
        </Modal>

        {/* Activation Invite Section */}
        <ContainerCard
          title={t("user.management.activationInvite.title", "教師邀請制開通")}
          subtitle={t(
            "user.management.activationInvite.description",
            "產生一次性教師邀請連結，交給對方登入或註冊後取得教師身分。"
          )}
          style={{ marginBottom: "2rem" }}
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Button
              kind="primary"
              onClick={() => handleIssueInvite()}
              disabled={issuingInvite}
            >
              {issuingInvite
                ? t("user.management.activationInvite.sending", "產生中...")
                : t("user.management.activationInvite.send", "邀請教師")}
            </Button>
            {latestInviteUrl ? (
              <Button
                kind="ghost"
                renderIcon={Copy}
                onClick={() => copy(latestInviteUrl)}
              >
                {isCopied
                  ? t("user.management.activationInvite.copied", "已複製")
                  : t("user.management.activationInvite.copy", "複製連結")}
              </Button>
            ) : null}
          </div>
          {latestInviteUrl ? (
            <div style={{ marginTop: "1rem" }}>
              <InlineNotification
                kind="info"
                title={t("user.management.activationInvite.latest", "最近一次邀請")}
                subtitle={`${t(
                  "user.management.activationInvite.expiresAt",
                  "到期"
                )}: ${latestInviteExpiresAt ? formatDateTime(latestInviteExpiresAt) : "—"} · ${latestInviteUrl}`}
                lowContrast
                hideCloseButton
              />
            </div>
          ) : null}
        </ContainerCard>

        {/* Search Section */}
        <ContainerCard
          title={t("user.management.searchLabel")}
          style={{ marginBottom: "2rem" }}
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <TextInput
                id="search"
                labelText={t("user.management.searchLabel")}
                placeholder={t("user.management.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
            </div>
            <Button
              kind="primary"
              renderIcon={Search}
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? tc("button.searching") : tc("button.search")}
            </Button>
            {searchQuery && (
              <Button
                kind="secondary"
                onClick={() => {
                  setSearchQuery("");
                  loadAllUsers();
                }}
              >
                {tc("button.clear")}
              </Button>
            )}
          </div>

          {error && (
            <div style={{ marginTop: "1rem" }}>
              <InlineNotification
                kind="error"
                title={tc("message.error")}
                subtitle={error}
                lowContrast
                hideCloseButton
              />
            </div>
          )}

          {success && (
            <div style={{ marginTop: "1rem" }}>
              <InlineNotification
                kind="success"
                title={tc("message.success")}
                subtitle={success}
                lowContrast
                hideCloseButton
              />
            </div>
          )}

          <div style={{ marginTop: "1rem" }}>
            <ButtonSet>
              <Button
                kind={roleFilter === "all" ? "primary" : "tertiary"}
                size="sm"
                onClick={() => setRoleFilter("all")}
              >
                {t("user.management.filters.all", "全部")}
              </Button>
              <Button
                kind={roleFilter === "student" ? "primary" : "tertiary"}
                size="sm"
                onClick={() => setRoleFilter("student")}
              >
                {t("user.role.student")}
              </Button>
              <Button
                kind={roleFilter === "teacher" ? "primary" : "tertiary"}
                size="sm"
                onClick={() => setRoleFilter("teacher")}
              >
                {t("user.role.teacher")}
              </Button>
              <Button
                kind={roleFilter === "admin" ? "primary" : "tertiary"}
                size="sm"
                onClick={() => setRoleFilter("admin")}
              >
                {t("user.role.admin")}
              </Button>
            </ButtonSet>
          </div>
        </ContainerCard>

        {/* Results Table */}
        {filteredUsers.length > 0 && (
          <ContainerCard
            title={t("user.management.searchResults", { count: filteredUsers.length })}
            padding="none"
          >
            <TableContainer>
                  <Table className={styles.userTable}>
                    <TableHead>
                      <TableRow>
                        <TableHeader>
                          {t("user.management.columns.username")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.email")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.displayName", "顯示名稱")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.currentRole")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.loginMethod")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.onboarding", "Onboarding")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.lastLogin", "最後登入")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.actions")}
                        </TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell><span className={styles.userIdentity}>{user.username}</span></TableCell>
                          <TableCell><span className={styles.userIdentity}>{user.email}</span></TableCell>
                          <TableCell><span className={styles.userIdentity}>{user.profile?.display_name || "—"}</span></TableCell>
                          <TableCell>
                            <Tag
                              type={
                                user.role === "admin"
                                  ? "purple"
                                  : user.role === "teacher"
                                  ? "green"
                                  : "cool-gray"
                              }
                            >
                              {getRoleLabel(user.role)}
                            </Tag>
                          </TableCell>
                          <TableCell>
                            {getProviderLabel(user.auth_provider)}
                          </TableCell>
                          <TableCell>
                            <Tag type={user.onboarding_completed_at ? "green" : "cool-gray"}>
                              {user.onboarding_completed_at
                                ? t("user.management.onboarding.completed", "已完成")
                                : t("user.management.onboarding.pending", "未完成")}
                            </Tag>
                          </TableCell>
                          <TableCell>{formatDateTime(user.last_login_at)}</TableCell>
                          <TableCell>
                            <div className={styles.userActions}>
                              {["email", "password"].includes(user.auth_provider || "") && (
                                <Button kind="tertiary" size="sm" disabled={issuingReset}
                                  onClick={() => handleIssueReset(user)}>
                                  {t("user.management.passwordReset.generate", "產生密碼重設連結")}
                                </Button>
                              )}
                              <Select
                                id={`role-select-${user.id}`}
                                labelText={`${user.username} ${t("user.management.changeRole", "變更角色")}`}
                                hideLabel
                                value={user.role}
                                onChange={(e) =>
                                  handleRoleChangeClick(
                                    user,
                                    e.target.value as ManagedUser["role"]
                                  )
                                }
                                size="sm"
                                style={{ minWidth: "120px" }}
                              >
                                <SelectItem
                                  value="student"
                                  text={t("user.role.student")}
                                />
                                <SelectItem
                                  value="teacher"
                                  text={t("user.role.teacher")}
                                />
                                <SelectItem
                                  value="admin"
                                  text={t("user.role.adminTA")}
                                />
                              </Select>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
          </ContainerCard>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={confirmModalOpen}
        onRequestClose={() => !updating && setConfirmModalOpen(false)}
        modalHeading={t("user.management.confirmRoleChange")}
        primaryButtonText={
          updating ? tc("button.updating") : tc("button.confirm")
        }
        secondaryButtonText={tc("button.cancel")}
        onRequestSubmit={handleConfirmRoleChange}
        onSecondarySubmit={() => setConfirmModalOpen(false)}
        primaryButtonDisabled={updating}
        preventCloseOnClickOutside={updating}
      >
        <p>
          {t("user.management.confirmRoleChangeMessage", {
            username: selectedUser?.username,
            oldRole: selectedUser && getRoleLabel(selectedUser.role),
            newRole: getRoleLabel(newRole),
          })}
        </p>
        {newRole === "admin" && (
                        <p style={{ marginTop: "1rem", color: "var(--cds-link-primary)" }}>
            ⓘ {t("user.management.adminPermissionNote")}
          </p>
        )}
        {selectedUser?.role === "student" && newRole === "teacher" && (
          <p style={{ marginTop: "1rem", color: "var(--cds-text-secondary)" }}>
            {t(
              "user.management.teacherActivationNote",
              "開通為教師後，該使用者即可建立教室與使用教師端管理功能。"
            )}
          </p>
        )}
      </Modal>
    </div>
  );
};

export default UserManagementScreen;
