import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
import { getModalPortalRoot } from "@/shared/ui/theme/portalRoot";
import {
  Button,
  DataTable,
  Dropdown,
  Modal,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
} from "@carbon/react";
import { Add, Edit, TrashCan } from "@carbon/icons-react";
import type {
  ClassroomDetail,
  ClassroomMember,
} from "@/core/entities/classroom.entity";
import { useToast } from "@/shared/contexts/ToastContext";
import { SettingsSection } from "@/features/auth/components/SettingsSection";
import {
  removeMember,
  updateMemberRole,
  regenerateCode,
} from "@/infrastructure/api/repositories/classroom.repository";
import { InviteCodeDisplay } from "./InviteCodeDisplay";
import { AddMembersModal } from "./AddMembersModal";

interface ClassroomSettingsMembersPanelProps {
  classroom: ClassroomDetail;
  onRefresh: () => Promise<void>;
}

const ROLE_ITEMS = [
  { id: "student" as const, label: "" },
  { id: "ta" as const, label: "" },
];

export const ClassroomSettingsMembersPanel: React.FC<ClassroomSettingsMembersPanelProps> = ({
  classroom,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const { t: tc } = useTranslation("common");

  const roleItems = useMemo(
    () => [
      { id: "all", label: t("classroom.memberRoleAll", "全部角色") },
      { id: "student", label: tc("role.student") },
      { id: "ta", label: tc("role.ta") },
    ],
    [t, tc],
  );

  const localizedRoleItems = useMemo(
    () => ROLE_ITEMS.map((r) => ({ ...r, label: tc(`role.${r.id}`) })),
    [tc],
  );

  const { showToast } = useToast();

  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "ta">("all");

  // Edit modal state
  const [editingMember, setEditingMember] = useState<ClassroomMember | null>(null);
  const [editRole, setEditRole] = useState<"student" | "ta">("student");

  // Delete confirm state (triggered from edit modal)
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<ClassroomMember | null>(null);

  type RowRole = "student" | "ta" | "admin";

  const adminIds = useMemo(
    () => new Set(classroom.admins.map((a) => a.id)),
    [classroom.admins],
  );

  const memberMap = useMemo(() => {
    const map = new Map<number, ClassroomMember>();
    for (const m of classroom.members) map.set(m.userId, m);
    return map;
  }, [classroom.members]);

  // Combine admins + members into a unified list
  const allRows = useMemo(() => {
    const adminRows = classroom.admins.map((a) => ({
      id: `admin-${a.id}`,
      numericId: a.id,
      username: a.username,
      email: "",
      role: "admin" as RowRole,
    }));
    const memberRows = classroom.members.map((m) => ({
      id: `member-${m.userId}`,
      numericId: m.userId,
      username: m.username,
      email: m.email,
      role: m.role as RowRole,
    }));
    return [...adminRows, ...memberRows];
  }, [classroom.admins, classroom.members]);

  const filteredRows = useMemo(() => {
    if (roleFilter === "all") return allRows;
    if (roleFilter === "student" || roleFilter === "ta") {
      return allRows.filter((r) => r.role === roleFilter);
    }
    return allRows;
  }, [allRows, roleFilter]);

  const headers = useMemo(
    () => [
      { key: "username", header: t("classroom.memberUsername", "使用者") },
      { key: "email", header: t("classroom.memberEmail", "Email") },
      { key: "role", header: t("classroom.memberRole", "角色") },
      { key: "actions", header: "" },
    ],
    [t],
  );

  const rows = useMemo(
    () =>
      filteredRows.map((r) => ({
        id: r.id,
        username: r.username,
        email: r.email,
        role: r.role,
      })),
    [filteredRows],
  );

  // Quick lookup from row id to numeric id
  const rowIdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allRows) map.set(r.id, r.numericId);
    return map;
  }, [allRows]);

  const handleRegenerateCode = async () => {
    try {
      await regenerateCode(classroom.id);
      showToast({ kind: "success", title: t("classroom.codeRegenerated", "邀請碼已重置") });
      setRegenerateConfirmOpen(false);
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.codeRegenerateFailed", "重置邀請碼失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleRemoveMember = async (member: ClassroomMember) => {
    try {
      await removeMember(classroom.id, member.userId);
      showToast({ kind: "success", title: t("classroom.memberRemoved", "成員已移除") });
      setPendingMemberRemoval(null);
      setEditingMember(null);
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.removeMemberFailed", "移除成員失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleUpdateMemberRole = async (member: ClassroomMember, role: "student" | "ta") => {
    try {
      await updateMemberRole(classroom.id, member.userId, role);
      showToast({ kind: "success", title: t("classroom.memberRoleUpdated", "成員角色已更新") });
      setEditingMember(null);
      await onRefresh();
    } catch (error) {
      showToast({
        kind: "error",
        title: t("classroom.memberRoleUpdateFailed", "更新成員角色失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const openEditModal = (member: ClassroomMember) => {
    setEditingMember(member);
    setEditRole(member.role as "student" | "ta");
  };

  const handleEditSave = () => {
    if (!editingMember) return;
    if (editRole !== editingMember.role) {
      void handleUpdateMemberRole(editingMember, editRole);
    } else {
      setEditingMember(null);
    }
  };

  return (
    <div className="settings-panel">
      {classroom.inviteCode && (
        <SettingsSection title={t("classroom.inviteCodeSection", "邀請碼")}>
          <InviteCodeDisplay
            code={classroom.inviteCode}
            enabled={classroom.inviteCodeEnabled}
            onRegenerate={() => setRegenerateConfirmOpen(true)}
          />
        </SettingsSection>
      )}

      <SettingsSection title={t("classroom.membersTitle", "成員列表")}>
        <DataTable rows={rows} headers={headers} isSortable>
          {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
            <TableContainer>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    onChange={(event) => {
                      if (event && typeof event !== "string") {
                        onInputChange(event);
                      }
                    }}
                    placeholder={t("classroom.memberSearchPlaceholder", "搜尋 username 或 email")}
                    persistent
                  />
                  <Dropdown
                    id="settings-member-role-filter"
                    label={t("classroom.memberRoleFilter", "角色篩選")}
                    titleText=""
                    hideLabel
                    items={roleItems}
                    itemToString={(item: { id: string; label: string } | null) => item?.label ?? ""}
                    selectedItem={roleItems.find((r) => r.id === roleFilter) ?? roleItems[0]}
                    onChange={({ selectedItem }: { selectedItem: { id: string; label: string } | null }) => {
                      if (selectedItem) setRoleFilter(selectedItem.id as "all" | "student" | "ta");
                    }}
                    size="lg"
                    style={{ minWidth: "8rem" }}
                  />
                  <Button kind="primary" size="lg" renderIcon={Add} onClick={() => setAddMembersOpen(true)}>
                    {t("classroom.addMembers", "新增成員")}
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()} size="md">
                <TableHead>
                  <TableRow>
                    {tableHeaders.map((header) => (
                      <TableHeader {...getHeaderProps({ header })} key={header.key}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length} style={{ textAlign: "center" }}>
                        {t("classroom.memberNoResult", "找不到符合篩選條件的成員")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row) => {
                      const numericId = rowIdMap.get(row.id);
                      const isAdmin = numericId != null && adminIds.has(numericId);
                      const member = numericId != null ? memberMap.get(numericId) : undefined;
                      const roleValue = isAdmin ? "admin" : ((member?.role ?? "student") as RowRole);
                      const roleTagType = roleValue === "admin" ? "red" : roleValue === "ta" ? "purple" : "teal";
                      const roleLabel = roleValue === "admin"
                        ? t("classroom.roleAdmin", "管理員")
                        : tc(`role.${roleValue}`);
                      return (
                        <TableRow {...getRowProps({ row })} key={row.id}>
                          {row.cells.map((cell) => {
                            if (cell.info.header === "role") {
                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={roleTagType} size="sm">
                                    {roleLabel}
                                  </Tag>
                                </TableCell>
                              );
                            }
                            if (cell.info.header === "actions") {
                              if (isAdmin) {
                                return <TableCell key={cell.id} />;
                              }
                              return (
                                <TableCell key={cell.id}>
                                  <div style={{ display: "flex", justifyContent: "center" }}>
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      hasIconOnly
                                      renderIcon={Edit}
                                      iconDescription={t("common.edit", "編輯")}
                                      onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        if (member) openEditModal(member);
                                      }}
                                    />
                                  </div>
                                </TableCell>
                              );
                            }
                            return <TableCell key={cell.id}>{cell.value}</TableCell>;
                          })}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </SettingsSection>

      {/* Add members modal */}
      <AddMembersModal
        open={addMembersOpen}
        classroomId={classroom.id}
        onClose={() => setAddMembersOpen(false)}
        onAdded={() => {
          void onRefresh();
        }}
      />

      {/* Edit member modal */}
      {ReactDOM.createPortal(
        <Modal
          open={Boolean(editingMember) && !pendingMemberRemoval}
          onRequestClose={() => setEditingMember(null)}
          onRequestSubmit={handleEditSave}
          modalHeading={t("classroom.editMember", "編輯成員")}
          primaryButtonText={t("common.save", "儲存")}
          secondaryButtonText={t("common.cancel", "取消")}
          size="sm"
        >
          {editingMember && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <strong>{editingMember.username}</strong>
                <span style={{ color: "var(--cds-text-secondary)", marginLeft: "0.5rem" }}>
                  {editingMember.email}
                </span>
              </div>
              <Dropdown
                id="edit-member-role"
                label=""
                titleText={t("classroom.memberRole", "角色")}
                items={localizedRoleItems}
                itemToString={(item: { id: string; label: string } | null) => item?.label ?? ""}
                selectedItem={localizedRoleItems.find((r) => r.id === editRole) ?? localizedRoleItems[0]}
                onChange={({ selectedItem }: { selectedItem: { id: string; label: string } | null }) => {
                  if (selectedItem) setEditRole(selectedItem.id as "student" | "ta");
                }}
              />
              <div style={{ borderTop: "1px solid var(--cds-border-subtle-01)", paddingTop: "1rem" }}>
                <Button
                  kind="danger--ghost"
                  size="sm"
                  renderIcon={TrashCan}
                  onClick={() => setPendingMemberRemoval(editingMember)}
                >
                  {t("classroom.removeMember", "移除成員")}
                </Button>
              </div>
            </div>
          )}
        </Modal>,
        getModalPortalRoot(),
      )}

      {/* Regenerate code confirm */}
      {ReactDOM.createPortal(
        <Modal
          open={regenerateConfirmOpen}
          size="sm"
          danger
          modalHeading={t("classroom.confirmRegenerateCodeTitle", "確認重置邀請碼")}
          primaryButtonText={t("common.confirm", "確認")}
          secondaryButtonText={t("common.cancel", "取消")}
          onRequestClose={() => setRegenerateConfirmOpen(false)}
          onRequestSubmit={() => {
            void handleRegenerateCode();
          }}
        >
          <p>
            {t(
              "classroom.confirmRegenerateCodeBody",
              "重置後舊邀請碼會立即失效，尚未加入的學生需改用新邀請碼。",
            )}
          </p>
        </Modal>,
        getModalPortalRoot(),
      )}

      {/* Remove member confirm */}
      {ReactDOM.createPortal(
        <Modal
          open={Boolean(pendingMemberRemoval)}
          size="sm"
          danger
          modalHeading={t("classroom.confirmRemoveMemberTitle", "確認移除此成員")}
          primaryButtonText={t("classroom.removeMember", "移除成員")}
          secondaryButtonText={t("common.cancel", "取消")}
          onRequestClose={() => setPendingMemberRemoval(null)}
          onRequestSubmit={() => {
            if (pendingMemberRemoval) {
              void handleRemoveMember(pendingMemberRemoval);
            }
          }}
        >
          <p>
            {t("classroom.confirmRemoveMemberBody", "你即將移除此成員：")}{" "}
            <strong>{pendingMemberRemoval?.username}</strong>
          </p>
        </Modal>,
        getModalPortalRoot(),
      )}
    </div>
  );
};
