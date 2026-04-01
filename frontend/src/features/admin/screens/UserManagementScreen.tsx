import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  CheckmarkFilled,
  Copy,
  TrashCan,
  WarningAlt,
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
  deleteUser,
  issueTeacherActivationInvite,
  searchUsers,
  updateUserRole,
} from "@/infrastructure/api/repositories/auth.repository";
import type { ManagedUser } from "@/core/entities/auth.entity";
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>("all");
  const [latestInviteUrl, setLatestInviteUrl] = useState("");
  const [latestInviteExpiresAt, setLatestInviteExpiresAt] = useState<string | null>(null);
  const { isCopied, copy } = useCopyText();

  // Load all users on mount
  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await searchUsers(""); // Empty query = all users
      if (response.success) {
        setUsers(response.data);
      } else {
        setError(t("user.management.loadFailed"));
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError(t("user.management.loadFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

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
      if (response.success) {
        setUsers(response.data);
        if (response.data.length === 0) {
          setError(t("user.management.noUsersFound"));
        }
      } else {
        setError(t("user.management.searchFailed"));
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError(t("user.management.searchFailedRetry"));
      }
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
      if (response.success) {
        setSuccess(response.message || tc("message.success"));
        // Update user in list
        setUsers(
          users.map((u) =>
            u.id === selectedUser.id ? { ...u, role: newRole } : u
          )
        );
        setConfirmModalOpen(false);
      } else {
        setError(t("user.management.updateFailed"));
      }
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError(t("user.management.updateFailedRetry"));
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteClick = (user: ManagedUser) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      await deleteUser(userToDelete.id);
      setSuccess(
        t("user.management.userDeleted", { email: userToDelete.email })
      );
      // Refresh user list
      loadAllUsers();
    } catch {
      setError(t("user.management.deleteError"));
    } finally {
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    }
  };

  const handleIssueInvite = async () => {
    setIssuingInvite(true);
    setError("");
    setSuccess("");

    try {
      const response = await issueTeacherActivationInvite();
      setSuccess(response.message || t("user.management.activationInvite.sent", "已產生教師開通連結"));
      setLatestInviteUrl(response.data.activation_url || "");
      setLatestInviteExpiresAt(response.data.expires_at || null);
      await loadAllUsers();
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError(
          err?.message ||
            t("user.management.activationInvite.failed", "產生教師開通連結失敗")
        );
      }
    } finally {
      setIssuingInvite(false);
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

  const pendingOnboardingCount = users.filter(
    (user) => !user.onboarding_completed_at
  ).length;
  const teacherCount = users.filter((user) => user.role === "teacher").length;
  const unverifiedCount = users.filter((user) => !user.email_verified).length;

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.pageInner}>
        <PageHeader
          title={t("user.management.title")}
          subtitle={t("user.management.description")}
        />

        <div className={styles.statTileRow}>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.totalUsers", "總使用者")}
            </p>
            <strong className={styles.statValue}>{users.length}</strong>
          </Tile>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.teachers", "已開通教師")}
            </p>
            <strong className={styles.statValue}>{teacherCount}</strong>
          </Tile>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.pendingOnboarding", "未完成 onboarding")}
            </p>
            <strong className={styles.statValue}>{pendingOnboardingCount}</strong>
          </Tile>
          <Tile>
            <p className={styles.statLabel}>
              {t("user.management.summary.unverified", "未驗證 Email")}
            </p>
            <strong className={styles.statValue}>{unverifiedCount}</strong>
          </Tile>
        </div>

        {/* Activation Invite Section */}
        <ContainerCard
          title={t("user.management.activationInvite.title", "教師邀請制開通")}
          subtitle={t(
            "user.management.activationInvite.description",
            "直接產生一次性 activation link。對方透過此連結登入或註冊後，即可完成 teacher 開通。"
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
                : t("user.management.activationInvite.send", "產生開通連結")}
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
                  <Table>
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
                          {t("user.management.columns.emailVerified")}
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
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.display_name || "—"}</TableCell>
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
                            {user.email_verified ? (
                              <CheckmarkFilled
                                size={20}
                                style={{ color: "var(--cds-support-success)" }}
                              />
                            ) : (
                              <span
                                style={{ color: "var(--cds-support-error)" }}
                              >
                                {t("user.management.notVerified")}
                              </span>
                            )}
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
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              {user.role === "student" && (
                                <>
                                  <Button
                                    kind="primary"
                                    size="sm"
                                    onClick={() => handleIssueInvite()}
                                    disabled={issuingInvite}
                                  >
                                    {t("user.management.sendTeacherInvite", "產生開通連結")}
                                  </Button>
                                  <Button
                                    kind="secondary"
                                    size="sm"
                                    onClick={() => handleRoleChangeClick(user, "teacher")}
                                  >
                                    {t("user.management.activateTeacher", "直接開通教師")}
                                  </Button>
                                </>
                              )}
                              {user.role === "teacher" && (
                                <Button
                                  kind="secondary"
                                  size="sm"
                                  onClick={() => handleRoleChangeClick(user, "student")}
                                >
                                  {t("user.management.revokeTeacher", "改回學生")}
                                </Button>
                              )}
                              <Select
                                id={`role-select-${user.id}`}
                                labelText=""
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
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                onClick={() => handleDeleteClick(user)}
                                hasIconOnly
                                iconDescription={t(
                                  "user.management.deleteUser"
                                )}
                              >
                                {tc("button.delete")}
                              </Button>
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

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteModalOpen}
        modalHeading={t("user.management.confirmDeleteUser")}
        primaryButtonText={tc("button.delete")}
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setIsDeleteModalOpen(false)}
        onRequestSubmit={handleDeleteConfirm}
        danger
      >
        <p>
          {t("user.management.confirmDeleteMessage", {
            email: userToDelete?.email,
          })}
        </p>
        <p
          style={{
            marginTop: "1rem",
            color: "var(--cds-text-error)",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          <WarningAlt size={16} /> {t("user.management.deleteWarning")}
        </p>
      </Modal>
    </div>
  );
};

export default UserManagementScreen;
