import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TextInput,
  Select,
  SelectItem,
  Toggle,
  NumberInput,
  Button,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
  Modal,
  Layer,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
} from "@carbon/react";
import { Add, TrashCan, Renew } from "@carbon/icons-react";

import { useContest } from "@/features/contest/contexts/ContestContext";
import {
  useExamAutoSave,
  type FieldSaveState,
} from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import { FieldSaveIndicator } from "@/shared/ui/autoSave/FieldSaveIndicator";
import { GlobalSaveStatus } from "@/shared/ui/autoSave/GlobalSaveStatus";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  archiveContest,
  deleteContest,
  exportContestResults,
  publishContestProblemsToPractice,
  getContestAdmins,
  addContestAdmin,
  removeContestAdmin,
} from "@/infrastructure/api/repositories";
import { AddAdminModal } from "@/features/contest/components/modals/AddAdminModal";
import type { ContestStatus } from "@/core/entities/contest.entity";
import s from "./AdminContestSettingsPanel.module.scss";

interface Admin {
  id: string;
  username: string;
}

// ── Shared text styles ──────────────────────────────────────────

const TITLE_STYLE: React.CSSProperties = {
  fontSize: "var(--cds-body-short-01-font-size, 0.875rem)",
  fontWeight: 400,
  lineHeight: "1.125rem",
  color: "var(--cds-text-primary)",
};

const DESC_STYLE: React.CSSProperties = {
  fontSize: "var(--cds-helper-text-01-font-size, 0.75rem)",
  fontWeight: 400,
  lineHeight: "1rem",
  color: "var(--cds-text-helper)",
  marginTop: "0.25rem",
};

// ── Layout primitives ───────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className={s.section}>
    <h4 className={s.sectionTitle} style={{
      fontSize: "var(--cds-heading-compact-01-font-size, 0.875rem)",
      fontWeight: 600,
      lineHeight: "1.125rem",
      color: "var(--cds-text-primary)",
    }}>
      {title}
    </h4>
    <Layer>
      <div className={s.sectionCard}>{children}</div>
    </Layer>
  </div>
);

interface RowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  saveState?: FieldSaveState;
  onRetry?: () => void;
}

const ActionRow: React.FC<RowProps> = ({
  label, description, children, saveState, onRetry,
}) => (
  <div className={s.actionRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{label}</div>
      {description && <div style={DESC_STYLE}>{description}</div>}
    </div>
    <div className={s.actionRowControl}>{children}</div>
    {saveState && saveState.status !== "idle" && (
      <FieldSaveIndicator status={saveState.status} error={saveState.error} onRetry={onRetry} />
    )}
  </div>
);

const FieldRow: React.FC<RowProps> = ({
  label, description, children, saveState, onRetry,
}) => (
  <div className={s.fieldRow}>
    <div className={s.fieldRowHeader} style={{ marginBottom: description ? 0 : "0.5rem" }}>
      <div style={TITLE_STYLE}>{label}</div>
      {saveState && saveState.status !== "idle" && (
        <FieldSaveIndicator status={saveState.status} error={saveState.error} onRetry={onRetry} />
      )}
    </div>
    {description && <div style={{ ...DESC_STYLE, marginBottom: "0.5rem" }}>{description}</div>}
    <div>{children}</div>
  </div>
);

interface DangerActionProps {
  title: string;
  description: string;
  buttonLabel: string;
  buttonKind?: "danger" | "danger--ghost" | "secondary";
  disabled?: boolean;
  onClick: () => void;
}

const DangerAction: React.FC<DangerActionProps> = ({
  title, description, buttonLabel, buttonKind = "danger--ghost", disabled, onClick,
}) => (
  <div className={s.dangerRow}>
    <div className={s.actionRowContent}>
      <div style={TITLE_STYLE}>{title}</div>
      <div style={DESC_STYLE}>{description}</div>
    </div>
    <Button kind={buttonKind} size="sm" disabled={disabled} onClick={onClick} style={{ flexShrink: 0 }}>
      {buttonLabel}
    </Button>
  </div>
);

// ── Helpers ─────────────────────────────────────────────────────

function toTimeInput(dateStr: string): string {
  const d = new Date(dateStr);
  let h = d.getHours() % 12;
  h = h || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h.toString().padStart(2, "0")}:${m}`;
}

function toDateInput(dateStr: string): string {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function isPM(dateStr: string): boolean {
  return new Date(dateStr).getHours() >= 12;
}

const STATUS_LABELS: Record<ContestStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

// ── Main Panel ──────────────────────────────────────────────────

const AdminContestSettingsScreen: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const { contest, refreshContest } = useContest();
  const { confirm, modalProps } = useConfirmModal();

  const autoSave = useExamAutoSave({
    contestId: contestId || "",
    debounceMs: 1500,
    onSaveSuccess: () => refreshContest(),
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const initializedRef = useRef(false);

  // ── Admin management state ──
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { showToast } = useToast();
  const adminRows = [
    ...(contest?.ownerUsername
      ? [{ id: "__owner__", username: contest.ownerUsername, role: "owner" as const }]
      : []),
    ...admins.map((a) => ({ id: a.id, username: a.username, role: "co-admin" as const })),
  ] as any;

  const loadAdmins = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestAdmins(contestId);
      setAdmins(data);
    } catch {
      showToast({ kind: "error", title: "無法載入管理員列表" });
    }
  }, [contestId, showToast]);

  useEffect(() => {
    if (!contestId) return;
    loadAdmins();
  }, [contestId, loadAdmins]);

  const handleAddAdmin = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestAdmin(contestId, username);
      showToast({ kind: "success", title: `成功新增管理員: ${username}` });
      setAddModalOpen(false);
      loadAdmins();
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增失敗";
      showToast({ kind: "error", title: message });
      throw error;
    }
  };

  const handleRemoveAdmin = async (admin: Admin) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: `確定要移除管理員 ${admin.username}？`,
      confirmLabel: "移除",
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeContestAdmin(contestId, admin.id);
      showToast({ kind: "success", title: `已移除管理員: ${admin.username}` });
      loadAdmins();
    } catch (error) {
      const message = error instanceof Error ? error.message : "移除失敗";
      showToast({ kind: "error", title: message });
    }
  };

  useEffect(() => {
    if (!contest || initializedRef.current) return;
    initializedRef.current = true;
    setForm({
      name: contest.name || "",
      description: contest.description || "",
      rules: contest.rules || "",
      startTime: contest.startTime || "",
      endTime: contest.endTime || "",
      status: contest.status || "draft",
      visibility: contest.visibility || "public",
      password: contest.password || "",
      cheatDetectionEnabled: contest.cheatDetectionEnabled ?? false,
      scoreboardVisibleDuringContest: contest.scoreboardVisibleDuringContest ?? false,
      anonymousModeEnabled: contest.anonymousModeEnabled ?? false,
      allowMultipleJoins: contest.allowMultipleJoins ?? false,
      maxCheatWarnings: contest.maxCheatWarnings ?? 0,
      allowAutoUnlock: contest.allowAutoUnlock ?? false,
      autoUnlockMinutes: contest.autoUnlockMinutes ?? 5,
    });
    if (contest.startTime) {
      setStartTimeInput(toTimeInput(contest.startTime));
      setStartDateInput(toDateInput(contest.startTime));
    }
    if (contest.endTime) {
      setEndTimeInput(toTimeInput(contest.endTime));
      setEndDateInput(toDateInput(contest.endTime));
    }
  }, [contest]);

  const getState = useCallback(
    (field: string): FieldSaveState | undefined => autoSave.fieldStates[field],
    [autoSave.fieldStates],
  );

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      autoSave.debouncedSaveField(field, value);
    },
    [autoSave],
  );

  const handleConfirmedChange = useCallback(
    async (field: string, value: unknown, message: string) => {
      const confirmed = await confirm({
        title: message,
        confirmLabel: tc("button.confirm"),
        cancelLabel: tc("button.cancel"),
        danger: true,
      });
      if (!confirmed) return;
      setForm((prev) => ({ ...prev, [field]: value }));
      autoSave.saveField(field, value);
    },
    [autoSave, confirm, tc],
  );

  const handleTimeChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      field: "startTime" | "endTime",
      inputSetter: (v: string) => void,
    ) => {
      const val = e.target.value;
      inputSetter(val);
      if (val.length === 5 && val.includes(":")) {
        const [h, m] = val.split(":").map(Number);
        if (!isNaN(h) && !isNaN(m) && h >= 1 && h <= 12 && m >= 0 && m <= 59) {
          const current = form[field] ? new Date(form[field] as string) : new Date();
          const curHours = current.getHours();
          const pm = curHours >= 12;
          let newH = h;
          if (pm) newH = h === 12 ? 12 : h + 12;
          else newH = h === 12 ? 0 : h;
          current.setHours(newH);
          current.setMinutes(m);
          handleChange(field, current.toISOString());
        }
      }
    },
    [form, handleChange],
  );

  const handleAmPmChange = useCallback(
    (value: string, field: "startTime" | "endTime") => {
      const d = form[field] ? new Date(form[field] as string) : new Date();
      let h = d.getHours();
      if (value === "PM" && h < 12) h += 12;
      if (value === "AM" && h >= 12) h -= 12;
      d.setHours(h);
      handleChange(field, d.toISOString());
    },
    [form, handleChange],
  );

  const handleDateChange = useCallback(
    (
      dates: Date[],
      field: "startTime" | "endTime",
      dateSetter: (v: string) => void,
    ) => {
      if (!dates?.length) return;
      const date = dates[0];
      const cur = form[field] ? new Date(form[field] as string) : new Date();
      date.setHours(cur.getHours());
      date.setMinutes(cur.getMinutes());
      const iso = date.toISOString();
      handleChange(field, iso);
      dateSetter(toDateInput(iso));
    },
    [form, handleChange],
  );

  const handleArchive = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("settings.confirmArchive"),
      confirmLabel: tc("button.confirm"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    await archiveContest(contestId);
    refreshContest();
  };

  const handlePublishToPractice = async () => {
    if (!contestId) return;
    try {
      setPublishing(true);
      await publishContestProblemsToPractice(contestId);
      setPublishModalOpen(false);
      refreshContest();
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("settings.confirmDelete"),
      confirmLabel: tc("button.delete"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    await deleteContest(contestId);
    navigate("/contests");
  };

  const handleExport = async () => {
    if (!contestId) return;
    await exportContestResults(contestId);
  };

  if (!contest) return null;

  return (
    <div className={s.root}>
      <div className={s.inner}>
        <div className={s.pageHeader}>
          <h2 style={{
            fontSize: "var(--cds-heading-04-font-size, 1.25rem)",
            fontWeight: 400,
            lineHeight: "1.625rem",
            color: "var(--cds-text-primary)",
            margin: 0,
          }}>
            {t("settings.title")}
          </h2>
          <GlobalSaveStatus status={autoSave.globalStatus} />
        </div>

      {/* ── 基本資訊 ── */}
      <Section title="基本資訊">
        <FieldRow
          label={t("settings.contestName")}
          description="顯示在競賽列表和頁首的名稱"
          saveState={getState("name")}
          onRetry={() => autoSave.retrySave("name")}
        >
          <TextInput
            id="settings-name"
            labelText=""
            hideLabel
            value={(form.name as string) || ""}
            onChange={(e) => handleChange("name", e.target.value)}
          />
        </FieldRow>

        <FieldRow
          label={t("settings.contestDescription")}
          description="簡短描述，出現在競賽概覽頁面"
          saveState={getState("description")}
          onRetry={() => autoSave.retrySave("description")}
        >
          <TextInput
            id="settings-description"
            labelText=""
            hideLabel
            value={(form.description as string) || ""}
            onChange={(e) => handleChange("description", e.target.value)}
          />
        </FieldRow>

        <FieldRow
          label={t("settings.contestRules")}
          description={t("settings.rulesHelperText")}
          saveState={getState("rules")}
          onRetry={() => autoSave.retrySave("rules")}
        >
          <MarkdownField
            id="settings-rules"
            value={(form.rules as string) || ""}
            onChange={(val) => handleChange("rules", val)}
            minHeight="180px"
            showPreview={false}
          />
        </FieldRow>

        <FieldRow
          label={tc("form.startDate")}
          description="競賽開始時間，學生只能在此時間後進入作答"
          saveState={getState("startTime")}
          onRetry={() => autoSave.retrySave("startTime")}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={startDateInput}
              onChange={(d) => handleDateChange(d, "startTime", setStartDateInput)}
            >
              <DatePickerInput id="settings-start-date" labelText="" hideLabel placeholder="mm/dd/yyyy" />
            </DatePicker>
            <TimePicker
              id="settings-start-time"
              labelText=""
              hideLabel
              placeholder="hh:mm"
              value={startTimeInput}
              onChange={(e) => handleTimeChange(e, "startTime", setStartTimeInput)}
            >
              <TimePickerSelect
                id="settings-start-ampm"
                value={form.startTime ? (isPM(form.startTime as string) ? "PM" : "AM") : "AM"}
                onChange={(e) => handleAmPmChange(e.target.value, "startTime")}
              >
                <SelectItem value="AM" text="AM" />
                <SelectItem value="PM" text="PM" />
              </TimePickerSelect>
            </TimePicker>
          </div>
        </FieldRow>

        <FieldRow
          label={tc("form.endDate")}
          description="競賽結束時間，超過後將自動停止收卷"
          saveState={getState("endTime")}
          onRetry={() => autoSave.retrySave("endTime")}
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <DatePicker
              datePickerType="single"
              dateFormat="m/d/Y"
              value={endDateInput}
              onChange={(d) => handleDateChange(d, "endTime", setEndDateInput)}
            >
              <DatePickerInput id="settings-end-date" labelText="" hideLabel placeholder="mm/dd/yyyy" />
            </DatePicker>
            <TimePicker
              id="settings-end-time"
              labelText=""
              hideLabel
              placeholder="hh:mm"
              value={endTimeInput}
              onChange={(e) => handleTimeChange(e, "endTime", setEndTimeInput)}
            >
              <TimePickerSelect
                id="settings-end-ampm"
                value={form.endTime ? (isPM(form.endTime as string) ? "PM" : "AM") : "AM"}
                onChange={(e) => handleAmPmChange(e.target.value, "endTime")}
              >
                <SelectItem value="AM" text="AM" />
                <SelectItem value="PM" text="PM" />
              </TimePickerSelect>
            </TimePicker>
          </div>
        </FieldRow>
      </Section>

      {/* ── 狀態與權限 ── */}
      <Section title="狀態與權限">
        <ActionRow
          label={t("settings.statusLabel")}
          description="Draft 狀態僅管理員可見；Published 後學生即可加入"
          saveState={getState("status")}
          onRetry={() => autoSave.retrySave("status")}
        >
          <Select
            id="settings-status"
            labelText=""
            hideLabel
            value={(form.status as string) || "draft"}
            disabled={form.status === "archived" || !contest?.permissions?.canToggleStatus}
            style={{ minWidth: 160 }}
            onChange={(e) => {
              const next = e.target.value as ContestStatus;
              const current = form.status as ContestStatus;
              handleConfirmedChange(
                "status",
                next,
                `確定將競賽狀態從「${STATUS_LABELS[current]}」改為「${STATUS_LABELS[next]}」？已發布的競賽會對學生可見。`,
              );
            }}
          >
            <SelectItem value="draft" text={tc("status.draft")} />
            <SelectItem value="published" text={tc("status.published")} />
            <SelectItem
              value="archived"
              text={tc("status.archived")}
              disabled={form.status !== "archived"}
            />
          </Select>
        </ActionRow>

        <ActionRow
          label={tc("form.visibility")}
          description="Private 競賽需要密碼才能加入"
          saveState={getState("visibility")}
          onRetry={() => autoSave.retrySave("visibility")}
        >
          <Select
            id="settings-visibility"
            labelText=""
            hideLabel
            value={(form.visibility as string) || "public"}
            style={{ minWidth: 160 }}
            onChange={(e) => handleChange("visibility", e.target.value)}
          >
            <SelectItem value="public" text={tc("status.public")} />
            <SelectItem value="private" text={tc("status.private")} />
          </Select>
        </ActionRow>

        {form.visibility === "private" && (
          <FieldRow
            label={t("settings.joinPassword")}
            description="學生加入時需輸入此密碼"
            saveState={getState("password")}
            onRetry={() => autoSave.retrySave("password")}
          >
            <TextInput
              id="settings-password"
              labelText=""
              hideLabel
              type="password"
              value={(form.password as string) || ""}
              onChange={(e) => handleChange("password", e.target.value)}
            />
          </FieldRow>
        )}
      </Section>

      {/* ── 顯示設定 ── */}
      <Section title="顯示設定">
        <ActionRow
          label={t("settings.showDuringContest")}
          description={t("settings.showDuringContestHelp")}
          saveState={getState("scoreboardVisibleDuringContest")}
          onRetry={() => autoSave.retrySave("scoreboardVisibleDuringContest")}
        >
          <Toggle
            id="settings-scoreboard"
            labelText=""
            hideLabel
            labelA={tc("toggle.hide")}
            labelB={tc("toggle.show")}
            toggled={(form.scoreboardVisibleDuringContest as boolean) ?? false}
            onToggle={(checked) => handleChange("scoreboardVisibleDuringContest", checked)}
          />
        </ActionRow>

        <ActionRow
          label={t("settings.anonymousMode")}
          description={t("settings.anonymousModeHelp")}
          saveState={getState("anonymousModeEnabled")}
          onRetry={() => autoSave.retrySave("anonymousModeEnabled")}
        >
          <Toggle
            id="settings-anonymous"
            labelText=""
            hideLabel
            labelA={tc("toggle.off")}
            labelB={tc("toggle.on")}
            toggled={(form.anonymousModeEnabled as boolean) ?? false}
            onToggle={(checked) => handleChange("anonymousModeEnabled", checked)}
          />
        </ActionRow>
      </Section>

      {/* ── 作弊檢查 ── */}
      <Section title="作弊檢查">
        <ActionRow
          label={t("settings.enableExamMode")}
          description="啟用後將開啟全螢幕監控、作弊偵測與答案鎖定機制"
          saveState={getState("cheatDetectionEnabled")}
          onRetry={() => autoSave.retrySave("cheatDetectionEnabled")}
        >
          <Toggle
            id="settings-exam-mode"
            labelText=""
            hideLabel
            labelA={tc("toggle.off")}
            labelB={tc("toggle.on")}
            toggled={(form.cheatDetectionEnabled as boolean) ?? false}
            onToggle={(checked) => {
              const msg = checked
                ? "開啟作弊檢查後將啟用作弊偵測和答案鎖定機制，確定開啟？"
                : "關閉作弊檢查將停用所有監控功能，確定關閉？";
              handleConfirmedChange("cheatDetectionEnabled", checked, msg);
            }}
          />
        </ActionRow>

        {(form.cheatDetectionEnabled as boolean) && (
          <>
            <ActionRow
              label={t("settings.allowMultipleJoins")}
              description="允許同一學生多次加入考試（例如斷線重連）"
              saveState={getState("allowMultipleJoins")}
              onRetry={() => autoSave.retrySave("allowMultipleJoins")}
            >
              <Toggle
                id="settings-multi-join"
                labelText=""
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={(form.allowMultipleJoins as boolean) ?? false}
                onToggle={(checked) => handleChange("allowMultipleJoins", checked)}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.maxWarnings")}
              description="違規警告達到上限後自動鎖定該學生，0 表示立即鎖定"
              saveState={getState("maxCheatWarnings")}
              onRetry={() => autoSave.retrySave("maxCheatWarnings")}
            >
              <NumberInput
                id="settings-max-warnings"
                label=""
                hideLabel
                min={0}
                max={10}
                value={(form.maxCheatWarnings as number) ?? 0}
                onChange={(_e, { value }) => handleChange("maxCheatWarnings", Number(value))}
                style={{ maxWidth: 140 }}
              />
            </ActionRow>

            <ActionRow
              label={t("settings.allowAutoUnlock")}
              description="鎖定後經過指定時間自動解鎖，無需監考人員手動處理"
              saveState={getState("allowAutoUnlock")}
              onRetry={() => autoSave.retrySave("allowAutoUnlock")}
            >
              <Toggle
                id="settings-auto-unlock"
                labelText=""
                hideLabel
                labelA={tc("toggle.forbid")}
                labelB={tc("toggle.allow")}
                toggled={(form.allowAutoUnlock as boolean) ?? false}
                onToggle={(checked) => handleChange("allowAutoUnlock", checked)}
              />
            </ActionRow>

            {(form.allowAutoUnlock as boolean) && (
              <ActionRow
                label={t("settings.autoUnlockMinutes")}
                description={t("settings.autoUnlockHelperText")}
                saveState={getState("autoUnlockMinutes")}
                onRetry={() => autoSave.retrySave("autoUnlockMinutes")}
              >
                <NumberInput
                  id="settings-unlock-mins"
                  label=""
                  hideLabel
                  min={1}
                  max={1440}
                  value={(form.autoUnlockMinutes as number) ?? 5}
                  onChange={(_e, { value }) => handleChange("autoUnlockMinutes", Number(value))}
                  style={{ maxWidth: 140 }}
                />
              </ActionRow>
            )}
          </>
        )}
      </Section>

      {/* ── 管理員 ── */}
      <Section title="管理員">
        <div className={s.actionRow} style={{ justifyContent: "space-between" }}>
          <div className={s.actionRowContent}>
            <div style={TITLE_STYLE}>管理員列表</div>
            <div style={DESC_STYLE}>Owner 擁有完整權限；共同管理員可管理題目與學生，但無法變更競賽狀態或刪除競賽</div>
          </div>
          <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
            <Button
              kind="ghost"
              renderIcon={Renew}
              onClick={loadAdmins}
              hasIconOnly
              iconDescription="重新整理"
              size="sm"
            />
            <Button
              renderIcon={Add}
              onClick={() => setAddModalOpen(true)}
              size="sm"
            >
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
                    const admin = !isOwner ? admins.find((a) => a.id === row.id) : null;
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
                              onClick={() => handleRemoveAdmin(admin)}
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
      </Section>

      {/* ── 匯出 & Danger Zone ── */}
      <Section title="匯出 & Danger Zone">
        <DangerAction
          title={t("settings.exportResults")}
          description={t("settings.exportResultsDesc")}
          buttonLabel={t("settings.exportCSV")}
          buttonKind="secondary"
          onClick={handleExport}
        />

        <DangerAction
          title={t("settings.archiveContest")}
          description={t("settings.archiveDesc")}
          buttonLabel={contest.status === "archived" ? t("settings.alreadyArchived") : tc("button.archive")}
          disabled={contest.status === "archived" || !contest.permissions?.canToggleStatus}
          onClick={handleArchive}
        />

        <DangerAction
          title={t("settings.publishToPractice")}
          description={t("settings.publishToPracticeDesc")}
          buttonLabel={
            contest.status === "archived"
              ? t("settings.publishToPractice")
              : t("settings.publishToPracticeHint")
          }
          buttonKind="secondary"
          disabled={contest.status !== "archived" || publishing}
          onClick={() => setPublishModalOpen(true)}
        />

        <DangerAction
          title={t("settings.deleteContest")}
          description={t("settings.deleteDesc")}
          buttonLabel={tc("button.delete")}
          buttonKind="danger"
          disabled={!contest.permissions?.canDeleteContest}
          onClick={handleDelete}
        />
      </Section>

      {/* Modals */}
      <Modal
        open={publishModalOpen}
        modalHeading={t("settings.publishToPracticeConfirmTitle")}
        primaryButtonText={t("settings.publishToPracticeConfirm")}
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={publishing}
        onRequestClose={() => !publishing && setPublishModalOpen(false)}
        onRequestSubmit={handlePublishToPractice}
      >
        <p style={{ marginBottom: "0.5rem" }}>{t("settings.publishToPracticeConfirmDesc")}</p>
        <p style={{ color: "var(--cds-text-secondary)" }}>{t("settings.publishToPracticeIrreversible")}</p>
      </Modal>

      <AddAdminModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddAdmin}
      />
      <ConfirmModal {...modalProps} />
      </div>
    </div>
  );
};

export default AdminContestSettingsScreen;
