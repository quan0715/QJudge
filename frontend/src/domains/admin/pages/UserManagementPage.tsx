import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  UserAdmin,
  CheckmarkFilled,
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
  Grid,
  Column,
} from "@carbon/react";
import { searchUsers, updateUserRole, deleteUser } from "@/services/auth";
import type { User } from "@/core/entities/auth.entity";

const UserManagementPage = () => {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState("");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

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

  const handleRoleChangeClick = (user: User, role: string) => {
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
            u.id === selectedUser.id ? { ...u, role: newRole as any } : u
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

  const handleDeleteClick = (user: User) => {
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

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        backgroundColor: "var(--cds-background)",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <div style={{ marginTop: "3rem", marginBottom: "2rem" }}>
              <h1
                style={{
                  fontSize: "var(--cds-productive-heading-05, 2rem)",
                  fontWeight: 400,
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "var(--cds-text-primary)",
                }}
              >
                <UserAdmin size={32} />
                {t("user.management.title")}
              </h1>
              <p
                style={{
                  fontSize: "var(--cds-body-long-01, 0.875rem)",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {t("user.management.description")}
              </p>
            </div>

            {/* Search Section */}
            <div
              className="carbon-panel"
              style={{
                padding: "1.5rem",
                marginBottom: "2rem",
                backgroundColor: "var(--cds-layer-01)",
                border: "1px solid var(--cds-border-subtle)",
              }}
            >
              <div
                style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}
              >
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
            </div>

            {/* Results Table */}
            {users.length > 0 && (
              <div
                className="carbon-panel"
                style={{
                  padding: "1.5rem",
                  backgroundColor: "var(--cds-layer-01)",
                  border: "1px solid var(--cds-border-subtle)",
                }}
              >
                <h2
                  style={{
                    fontSize: "var(--cds-heading-03, 1.25rem)",
                    fontWeight: 400,
                    marginBottom: "1rem",
                    color: "var(--cds-text-primary)",
                  }}
                >
                  {t("user.management.searchResults", { count: users.length })}
                </h2>
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
                          {t("user.management.columns.currentRole")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.loginMethod")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.emailVerified")}
                        </TableHeader>
                        <TableHeader>
                          {t("user.management.columns.actions")}
                        </TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>{user.username}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Tag
                              type={
                                user.role === "admin"
                                  ? "blue"
                                  : user.role === "teacher"
                                  ? "red"
                                  : "gray"
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
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <Select
                                id={`role-select-${user.id}`}
                                labelText=""
                                value={user.role}
                                onChange={(e) =>
                                  handleRoleChangeClick(user, e.target.value)
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
              </div>
            )}
          </Column>
        </Grid>
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

export default UserManagementPage;
