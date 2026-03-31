import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import {
  Button,
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { Add, Renew, TrashCan } from "@carbon/icons-react";

import type { ContestDetail } from "@/core/entities/contest.entity";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import {
  TITLE_STYLE,
  DESC_STYLE,
  Section,
} from "@/features/contest/components/admin/AdminSettingsPanelLayout";
import AdminContestSettingsFormSections from "@/features/contest/components/admin/AdminContestSettingsFormSections";
import { settingsPanelStyles as s } from "@/shared/layout/SettingsPanel";

interface Admin {
  id: string;
  username: string;
}

type TranslateFn = TFunction;

interface DangerActionProps {
  title: string;
  description: string;
  buttonLabel: string;
  buttonKind?: "danger" | "danger--ghost" | "secondary";
  disabled?: boolean;
  onClick: () => void;
}

const DangerAction = ({
  title,
  description,
  buttonLabel,
  buttonKind = "danger--ghost",
  disabled,
  onClick,
}: DangerActionProps) => (
  <div className={s.dangerRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{title}</div>
      <div style={DESC_STYLE}>{description}</div>
    </div>
    <Button
      kind={buttonKind}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      style={{ flexShrink: 0 }}
    >
      {buttonLabel}
    </Button>
  </div>
);

interface AdminContestSettingsContentProps {
  t: TranslateFn;
  tc: TranslateFn;
  contest: ContestDetail;
  form: Record<string, unknown>;
  startDateInput: string;
  endDateInput: string;
  startTimeInput: string;
  endTimeInput: string;
  startMeridiem: "AM" | "PM";
  endMeridiem: "AM" | "PM";
  isClassroomBound: boolean;
  admins: Admin[];
  adminRows: Array<{ id: string; username: string; role: "owner" | "co-admin" }>;
  getState: (field: string) => FieldSaveState | undefined;
  onRetry: (field: string) => void;
  onChange: (field: string, value: unknown) => void;
  onConfirmedChange: (field: string, value: unknown, message: string) => void;
  onStartDateChange: (dates: Date[]) => void;
  onEndDateChange: (dates: Date[]) => void;
  onStartTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEndTimeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onStartMeridiemChange: (value: string) => void;
  onEndMeridiemChange: (value: string) => void;
  onRefreshAdmins: () => void;
  onOpenAddAdmin: () => void;
  onRemoveAdmin: (admin: Admin) => void;
  onArchive: () => void;
  onDelete: () => void;
}

const AdminContestSettingsContent = ({
  t,
  tc,
  contest,
  form,
  startDateInput,
  endDateInput,
  startTimeInput,
  endTimeInput,
  startMeridiem,
  endMeridiem,
  isClassroomBound,
  admins,
  adminRows,
  getState,
  onRetry,
  onChange,
  onConfirmedChange,
  onStartDateChange,
  onEndDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onStartMeridiemChange,
  onEndMeridiemChange,
  onRefreshAdmins,
  onOpenAddAdmin,
  onRemoveAdmin,
  onArchive,
  onDelete,
}: AdminContestSettingsContentProps) => (
  <>
    <AdminContestSettingsFormSections
      t={t}
      tc={tc}
      contest={contest}
      form={form}
      startDateInput={startDateInput}
      endDateInput={endDateInput}
      startTimeInput={startTimeInput}
      endTimeInput={endTimeInput}
      startMeridiem={startMeridiem}
      endMeridiem={endMeridiem}
      getState={getState}
      onRetry={onRetry}
      onChange={onChange}
      onConfirmedChange={onConfirmedChange}
      onStartDateChange={onStartDateChange}
      onEndDateChange={onEndDateChange}
      onStartTimeChange={onStartTimeChange}
      onEndTimeChange={onEndTimeChange}
      onStartMeridiemChange={onStartMeridiemChange}
      onEndMeridiemChange={onEndMeridiemChange}
    />

    <Section title="管理員">
      {isClassroomBound ? (
        <div className={s.actionRow}>
          <div className={s.actionRowContent}>
            <div style={TITLE_STYLE}>此競賽已由 Classroom 接管</div>
            <div style={DESC_STYLE}>
              請至 Classroom 成員管理調整 Owner / TA / Student 權限，Contest 不再維護獨立管理員列表。
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={s.actionRow} style={{ justifyContent: "space-between" }}>
            <div className={s.actionRowContent}>
              <div style={TITLE_STYLE}>管理員列表</div>
              <div style={DESC_STYLE}>
                Owner 擁有完整權限；共同管理員可管理題目與學生，但無法變更競賽狀態或刪除競賽
              </div>
            </div>
            <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
              <Button
                kind="ghost"
                renderIcon={Renew}
                onClick={onRefreshAdmins}
                hasIconOnly
                iconDescription="重新整理"
                size="sm"
              />
              <Button renderIcon={Add} onClick={onOpenAddAdmin} size="sm">
                新增
              </Button>
            </div>
          </div>

          <DataTable
            rows={adminRows}
            headers={[
              { key: "username", header: "用戶名" },
              { key: "role", header: "身份" },
              { key: "actions", header: "操作" },
            ]}
          >
            {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
              <TableContainer>
                <Table {...getTableProps()} size="sm">
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => {
                        const { key, ...headerProps } = getHeaderProps({ header });
                        return (
                          <TableHeader key={key} {...headerProps}>
                            {header.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => {
                      const isOwner = row.id === "__owner__";
                      const admin = !isOwner ? admins.find((entry) => entry.id === row.id) : null;
                      const { key: rowKey, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow key={rowKey} {...rowProps}>
                          <TableCell>{row.cells[0].value}</TableCell>
                          <TableCell>
                            {isOwner ? (
                              <Tag type="blue" size="sm">Owner</Tag>
                            ) : (
                              <Tag type="teal" size="sm">Co-admin</Tag>
                            )}
                          </TableCell>
                          <TableCell>
                            {!isOwner && admin && (
                              <Button
                                kind="danger--ghost"
                                size="sm"
                                renderIcon={TrashCan}
                                hasIconOnly
                                iconDescription="移除"
                                onClick={() => onRemoveAdmin(admin)}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </>
      )}
    </Section>

    <Section title="Danger Zone">
      <DangerAction
        title={t("settings.archiveContest")}
        description={t("settings.archiveDesc")}
        buttonLabel={
          contest.status === "archived"
            ? t("settings.alreadyArchived")
            : tc("button.archive")
        }
        disabled={contest.status === "archived" || !contest.permissions?.canToggleStatus}
        onClick={onArchive}
      />

      <DangerAction
        title={t("settings.deleteContest")}
        description={t("settings.deleteDesc")}
        buttonLabel={tc("button.delete")}
        buttonKind="danger"
        disabled={!contest.permissions?.canDeleteContest}
        onClick={onDelete}
      />
    </Section>
  </>
);

export default AdminContestSettingsContent;
