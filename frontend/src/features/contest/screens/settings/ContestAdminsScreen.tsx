import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  InlineNotification,
} from "@carbon/react";
import { AddAdminModal } from "../../components/modals/AddAdminModal";
import { Add, TrashCan, Renew } from "@carbon/icons-react";

import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";
import {
  getContestAdmins,
  addContestAdmin,
  removeContestAdmin,
} from "@/infrastructure/api/repositories";
import { useContest } from "@/features/contest/contexts/ContestContext";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

interface Admin {
  id: string;
  username: string;
}

const ContestAdminsPage: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { contest } = useContest();

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const { confirm, modalProps } = useConfirmModal();

  useEffect(() => {
    if (contestId) {
      loadAdmins();
    }
  }, [contestId]);

  const loadAdmins = async () => {
    if (!contestId) return;
    try {
      const data = await getContestAdmins(contestId);
      setAdmins(data);
    } catch (error) {
      console.error("Failed to load admins", error);
      setNotification({ kind: "error", message: "無法載入管理員列表" });
    }
  };

  const handleAddAdmin = async (username: string) => {
    if (!contestId) return;

    try {
      await addContestAdmin(contestId, username);
      setNotification({
        kind: "success",
        message: `成功新增管理員: ${username}`,
      });
      setAddModalOpen(false);
      loadAdmins();
    } catch (error: any) {
      setNotification({ kind: "error", message: error.message || "新增失敗" });
      throw error;
    }
  };

  const handleRemoveAdmin = async (admin: Admin) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: `確定要移除管理員 ${admin.username}？`,
      confirmLabel: "移除",
      cancelLabel: "取消",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await removeContestAdmin(contestId, admin.id);
      setNotification({
        kind: "success",
        message: `已移除管理員: ${admin.username}`,
      });
      loadAdmins();
    } catch (error: any) {
      setNotification({ kind: "error", message: error.message || "移除失敗" });
    }
  };

  // Removed full-page loading guard - show empty table instead

  const rows = admins.map((admin) => ({
    id: admin.id,
    username: admin.username,
  }));

  const headers = [
    { key: "username", header: "用戶名" },
    { key: "actions", header: "操作" },
  ];

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div
        style={{
          padding: "0",
          maxWidth: "100%",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <ContainerCard
          title="競賽管理員"
          noPadding
          action={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Renew}
                onClick={loadAdmins}
                hasIconOnly
                iconDescription="重新整理"
              />
              <Button
                size="sm"
                renderIcon={Add}
                onClick={() => setAddModalOpen(true)}
              >
                新增
              </Button>
            </div>
          }
        >
          {/* Owner Info */}
          <div
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--cds-border-subtle)",
              backgroundColor: "var(--cds-layer-accent-01)",
            }}
          >
            <div
              style={{
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
                marginBottom: "0.25rem",
              }}
            >
              擁有者 (Owner)
            </div>
            <div style={{ fontWeight: 500 }}>
              {contest?.permissions?.canEditContest ? "您" : "N/A"}
            </div>
          </div>

          {/* Admins Table */}
          {admins.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--cds-text-secondary)",
              }}
            >
              尚無其他管理員
            </div>
          ) : (
            <DataTable rows={rows} headers={headers}>
              {({
                rows,
                headers,
                getTableProps,
                getHeaderProps,
                getRowProps,
              }) => (
                <TableContainer>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => {
                          const { key, ...headerProps } = getHeaderProps({
                            header,
                          });
                          return (
                            <TableHeader key={key} {...headerProps}>
                              {header.header}
                            </TableHeader>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row, index) => {
                        const { key: rowKey, ...rowProps } = getRowProps({
                          row,
                        });
                        return (
                          <TableRow key={rowKey} {...rowProps}>
                            <TableCell>{row.cells[0].value}</TableCell>
                            <TableCell>
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                hasIconOnly
                                iconDescription="移除"
                                onClick={() => handleRemoveAdmin(admins[index])}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          )}
        </ContainerCard>

        {/* Add Admin Modal */}
        <AddAdminModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddAdmin}
        />
        <ConfirmModal {...modalProps} />
      </div>
    </SurfaceSection>
  );
};

export default ContestAdminsPage;
