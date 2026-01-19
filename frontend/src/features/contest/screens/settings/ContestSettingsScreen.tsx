import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Form,
  TextInput,
  TextArea,
  Select,
  Toggle,
  Button,
  TimePicker,
  TimePickerSelect,
  SelectItem,
  NumberInput,
  Loading,
  InlineNotification,
  Grid,
  Column,
  DatePicker,
  DatePickerInput,
  Modal,
} from "@carbon/react";
import { Save, Download } from "@carbon/icons-react";
import {
  updateContest,
  archiveContest,
  deleteContest,
  exportContestResults,
  publishContestProblemsToPractice,
} from "@/infrastructure/api/repositories";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { ContestUpdatePayload } from "@/core/ports/contest.repository";
import { useContest } from "@/features/contest/contexts/ContestContext";

import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";

const ContestAdminSettingsPage = () => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();

  // Use contest from context - no full-page loading needed
  const {
    contest: contextContest,
    loading: contextLoading,
    refreshContest,
  } = useContest();

  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ContestUpdatePayload>({});
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [formInitialized, setFormInitialized] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { confirm, modalProps } = useConfirmModal();

  // Local state for time inputs
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  // Local state for date inputs
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");

  // Danger Zone State
  // const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  // const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Initialize form when context contest is available
  useEffect(() => {
    if (contextContest && !formInitialized) {
      initializeForm(contextContest);
      setFormInitialized(true);
    }
  }, [contextContest, formInitialized]);

  const initializeForm = (data: ContestDetail) => {
    setFormData({
      name: data.name || "",
      description: data.description || "",
      rules: data.rules || "",
      startTime: data.startTime || "",
      endTime: data.endTime || "",
      visibility: data.visibility || "public",
      password: data.password || "",
      examModeEnabled: data.examModeEnabled || false,
      scoreboardVisibleDuringContest:
        data.scoreboardVisibleDuringContest || false,
      allowMultipleJoins: data.allowMultipleJoins || false,
      maxCheatWarnings: data.maxCheatWarnings || 0,
      allowAutoUnlock: data.allowAutoUnlock || false,
      autoUnlockMinutes: data.autoUnlockMinutes || 0,
      status: (data.status || "draft") as any,
      anonymousModeEnabled: data.anonymousModeEnabled || false,
    });

    if (data.startTime) {
      initTimeInput(data.startTime, setStartTimeInput);
      initDateInput(data.startTime, setStartDateInput);
    }
    if (data.endTime) {
      initTimeInput(data.endTime, setEndTimeInput);
      initDateInput(data.endTime, setEndDateInput);
    }
  };

  const initTimeInput = (dateStr: string, setter: (val: string) => void) => {
    const date = new Date(dateStr);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    hours = hours % 12;
    hours = hours ? hours : 12;
    setter(`${hours.toString().padStart(2, "0")}:${minutes}`);
  };

  const initDateInput = (dateStr: string, setter: (val: string) => void) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const year = date.getFullYear();
    setter(`${month}/${day}/${year}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contestId) return;

    try {
      setSaving(true);

      // Filter out empty password to avoid overwriting existing password
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password;
      }

      await updateContest(contestId, payload);

      // 等待 context 刷新完成，確保其他組件能看到最新數據
      await refreshContest();

      // 刷新完成後顯示成功通知
      // 注意：不需要重置 formInitialized，因為 formData 已經是用戶編輯的最新狀態
      setNotification({ kind: "success", message: t("settings.updated") });
    } catch (error) {
      console.error("Failed to update contest", error);
      setNotification({ kind: "error", message: t("settings.updateFailed") });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("settings.confirmArchive"),
      confirmLabel: tc("button.confirm"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await archiveContest(contestId);
      setNotification({ kind: "success", message: t("settings.archived") });
      setFormInitialized(false);
      refreshContest();
    } catch (error) {
      setNotification({ kind: "error", message: t("settings.archiveFailed") });
    }
  };

  const handlePublishToPractice = async () => {
    if (!contestId) return;
    try {
      setPublishing(true);
      await publishContestProblemsToPractice(contestId);
      setNotification({
        kind: "success",
        message: t("settings.publishPracticeSuccess"),
      });
      setPublishModalOpen(false);
    } catch (error: any) {
      setNotification({
        kind: "error",
        message: error?.message || t("settings.publishPracticeFailed"),
      });
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
    try {
      await deleteContest(contestId);
      navigate("/contests");
    } catch (error) {
      setNotification({ kind: "error", message: t("settings.deleteFailed") });
    }
  };

  // Helper for TimePicker change
  const handleTimeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "startTime" | "endTime",
    inputSetter: (v: string) => void
  ) => {
    const val = e.target.value;
    inputSetter(val);

    if (val.length === 5 && val.includes(":")) {
      const [h, m] = val.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m) && h >= 1 && h <= 12 && m >= 0 && m <= 59) {
        const date = formData[field] ? new Date(formData[field]!) : new Date();
        const currentHours = date.getHours();
        const isPM = currentHours >= 12;
        let newHours = h;

        if (isPM) {
          if (h === 12) newHours = 12;
          else newHours = h + 12;
        } else {
          if (h === 12) newHours = 0;
          else newHours = h;
        }

        date.setHours(newHours);
        date.setMinutes(m);
        setFormData({ ...formData, [field]: date.toISOString() });
      }
    }
  };

  const handleAmpPmChange = (
    value: string,
    field: "startTime" | "endTime"
  ) => {
    const date = formData[field] ? new Date(formData[field]!) : new Date();
    let hours = date.getHours();

    if (value === "PM" && hours < 12) hours += 12;
    if (value === "AM" && hours >= 12) hours -= 12;

    date.setHours(hours);
    setFormData({ ...formData, [field]: date.toISOString() });
  };

  const handleDateChange = (
    dates: Date[],
    field: "startTime" | "endTime",
    dateSetter: (val: string) => void
  ) => {
    if (dates && dates.length > 0) {
      const date = dates[0];
      const current = formData[field] ? new Date(formData[field]!) : new Date();
      date.setHours(current.getHours());
      date.setMinutes(current.getMinutes());
      setFormData({ ...formData, [field]: date.toISOString() });
      // Update local date input
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const year = date.getFullYear();
      dateSetter(`${month}/${day}/${year}`);
    }
  };

  if (contextLoading && !formInitialized) return <Loading />;
  if (!contextContest) return <div>Contest not found</div>;

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
            title={
              notification.kind === "success"
                ? tc("message.success")
                : tc("message.error")
            }
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        <Form onSubmit={handleSubmit}>
          <Grid>
            {/* Left Column: Basic Info */}
            <Column lg={10} md={8} sm={4} style={{ marginBottom: "1rem" }}>
              <ContainerCard title={t("settings.basicInfo")}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <TextInput
                    id="name"
                    labelText={t("settings.contestName")}
                    value={formData.name || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <TextInput
                    id="description"
                    labelText={t("settings.contestDescription")}
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <TextArea
                    id="rules"
                    labelText={t("settings.contestRules")}
                    helperText={t("settings.rulesHelperText")}
                    value={formData.rules || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, rules: e.target.value })
                    }
                    rows={15}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    flexDirection: "column",
                  }}
                >
                  {/* Start Time */}
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <DatePicker
                        datePickerType="single"
                        dateFormat="m/d/Y"
                        value={startDateInput}
                        onChange={(d) =>
                          handleDateChange(d, "startTime", setStartDateInput)
                        }
                      >
                        <DatePickerInput
                          id="start-date"
                          labelText={tc("form.startDate")}
                          placeholder="mm/dd/yyyy"
                        />
                      </DatePicker>
                    </div>
                    <div style={{ flex: 1 }}>
                      <TimePicker
                        id="start-time"
                        labelText={tc("form.startTime")}
                        type="text"
                        placeholder="hh:mm"
                        pattern="(0[1-9]|1[0-2]):[0-5][0-9]"
                        value={startTimeInput}
                        onChange={(e) =>
                          handleTimeChange(e, "startTime", setStartTimeInput)
                        }
                      >
                        <TimePickerSelect
                          id="start-time-select"
                          value={
                            formData.startTime &&
                            new Date(formData.startTime).getHours() >= 12
                              ? "PM"
                              : "AM"
                          }
                          onChange={(e) =>
                            handleAmpPmChange(e.target.value, "startTime")
                          }
                        >
                          <SelectItem value="AM" text="AM" />
                          <SelectItem value="PM" text="PM" />
                        </TimePickerSelect>
                      </TimePicker>
                    </div>
                  </div>

                  {/* End Time */}
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <DatePicker
                        datePickerType="single"
                        dateFormat="m/d/Y"
                        value={endDateInput}
                        onChange={(d) =>
                          handleDateChange(d, "endTime", setEndDateInput)
                        }
                      >
                        <DatePickerInput
                          id="end-date"
                          labelText={tc("form.endDate")}
                          placeholder="mm/dd/yyyy"
                        />
                      </DatePicker>
                    </div>
                    <div style={{ flex: 1 }}>
                      <TimePicker
                        id="end-time"
                        labelText={tc("form.endTime")}
                        type="text"
                        placeholder="hh:mm"
                        pattern="(0[1-9]|1[0-2]):[0-5][0-9]"
                        value={endTimeInput}
                        onChange={(e) =>
                          handleTimeChange(e, "endTime", setEndTimeInput)
                        }
                      >
                        <TimePickerSelect
                          id="end-time-select"
                          value={
                            formData.endTime &&
                            new Date(formData.endTime).getHours() >= 12
                              ? "PM"
                              : "AM"
                          }
                          onChange={(e) =>
                            handleAmpPmChange(e.target.value, "endTime")
                          }
                        >
                          <SelectItem value="AM" text="AM" />
                          <SelectItem value="PM" text="PM" />
                        </TimePickerSelect>
                      </TimePicker>
                    </div>
                  </div>
                </div>
              </ContainerCard>
            </Column>

            {/* Right Column: Access & Exam Mode */}
            <Column lg={6} md={8} sm={4} style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  height: "100%",
                }}
              >
                <ContainerCard title={t("settings.accessControl")}>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <Select
                      id="visibility"
                      labelText={tc("form.visibility")}
                      value={formData.visibility || "public"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          visibility: e.target.value as any,
                        })
                      }
                    >
                      <SelectItem value="public" text={tc("status.public")} />
                      <SelectItem value="private" text={tc("status.private")} />
                    </Select>
                  </div>
                  {formData.visibility === "private" && (
                    <div>
                      <TextInput
                        id="password"
                        labelText={t("settings.joinPassword")}
                        type="password"
                        value={formData.password || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                      />
                    </div>
                  )}
                </ContainerCard>

                <ContainerCard title={t("settings.contestStatus")}>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <Select
                      id="contest-status"
                      labelText={t("settings.statusLabel")}
                      value={formData.status || "draft"}
                      disabled={formData.status === "archived"}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as any,
                        })
                      }
                    >
                      <SelectItem value="draft" text={tc("status.draft")} />
                      <SelectItem
                        value="published"
                        text={tc("status.published")}
                      />
                      <SelectItem
                        value="archived"
                        text={tc("status.archived")}
                        disabled={formData.status !== "archived"}
                      />
                    </Select>
                  </div>
                </ContainerCard>

                <ContainerCard title={t("settings.scoreboardSettings")}>
                  <div style={{ marginBottom: "1rem" }}>
                    <Toggle
                      id="scoreboard-visible-global"
                      labelText={t("settings.showDuringContest")}
                      labelA={tc("toggle.hide")}
                      labelB={tc("toggle.show")}
                      toggled={
                        formData.scoreboardVisibleDuringContest ?? false
                      }
                      onToggle={(checked) =>
                        setFormData({
                          ...formData,
                          scoreboardVisibleDuringContest: checked,
                        })
                      }
                    />
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                        marginTop: "0.5rem",
                      }}
                    >
                      {t("settings.showDuringContestHelp")}
                    </p>
                  </div>
                  <div
                    style={{
                      borderTop: "1px solid var(--cds-border-subtle)",
                      margin: "1rem 0",
                    }}
                  />
                  <div>
                    <Toggle
                      id="anonymous-mode"
                      labelText={t("settings.anonymousMode")}
                      labelA={tc("toggle.off")}
                      labelB={tc("toggle.on")}
                      toggled={formData.anonymousModeEnabled ?? false}
                      onToggle={(checked) =>
                        setFormData({
                          ...formData,
                          anonymousModeEnabled: checked,
                        })
                      }
                    />
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary)",
                        marginTop: "0.5rem",
                      }}
                    >
                      {t("settings.anonymousModeHelp")}
                    </p>
                  </div>
                </ContainerCard>

                <ContainerCard title={t("settings.examModeSettings")}>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <Toggle
                      id="exam-mode"
                      labelText={t("settings.enableExamMode")}
                      labelA={tc("toggle.off")}
                      labelB={tc("toggle.on")}
                      toggled={formData.examModeEnabled ?? false}
                      onToggle={(checked) =>
                        setFormData({ ...formData, examModeEnabled: checked })
                      }
                    />
                  </div>

                  {(formData.examModeEnabled ?? false) && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <Toggle
                        id="allow-multiple-joins"
                        labelText={t("settings.allowMultipleJoins")}
                        labelA={tc("toggle.forbid")}
                        labelB={tc("toggle.allow")}
                        toggled={formData.allowMultipleJoins ?? false}
                        onToggle={(checked) =>
                          setFormData({
                            ...formData,
                            allowMultipleJoins: checked,
                          })
                        }
                      />

                      <NumberInput
                        id="max-warnings"
                        label={t("settings.maxWarnings")}
                        min={0}
                        max={10}
                        value={formData.maxCheatWarnings || 0}
                        onChange={(_, { value }) =>
                          setFormData({
                            ...formData,
                            maxCheatWarnings: Number(value),
                          })
                        }
                      />

                      <div
                        style={{
                          borderTop: "1px solid var(--cds-border-subtle)",
                          margin: "0.5rem 0",
                        }}
                      />

                      <Toggle
                        id="allow-auto-unlock"
                        labelText={t("settings.allowAutoUnlock")}
                        labelA={tc("toggle.forbid")}
                        labelB={tc("toggle.allow")}
                        toggled={formData.allowAutoUnlock ?? false}
                        onToggle={(checked) =>
                          setFormData({
                            ...formData,
                            allowAutoUnlock: checked,
                          })
                        }
                      />

                      {(formData.allowAutoUnlock ?? false) && (
                        <NumberInput
                          id="auto-unlock-minutes"
                          label={t("settings.autoUnlockMinutes")}
                          helperText={t("settings.autoUnlockHelperText")}
                          min={1}
                          max={1440}
                          value={formData.autoUnlockMinutes || 5}
                          onChange={(_, { value }) =>
                            setFormData({
                              ...formData,
                              autoUnlockMinutes: Number(value),
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                </ContainerCard>
              </div>
            </Column>
          </Grid>

          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button
              kind="primary"
              type="submit"
              renderIcon={Save}
              disabled={saving}
            >
              {saving ? t("settings.saving") : t("settings.saveSettings")}
            </Button>
          </div>
        </Form>

        {/* Export Section */}
        <div
          style={{
            marginTop: "2rem",
            borderTop: "1px solid var(--cds-border-subtle)",
            paddingTop: "2rem",
          }}
        >
          <h4 style={{ marginBottom: "1rem" }}>{t("settings.exportData")}</h4>
          <div
            style={{
              border: "1px solid var(--cds-border-subtle)",
              borderRadius: "4px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600 }}>
                  {t("settings.exportResults")}
                </h5>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("settings.exportResultsDesc")}
                </p>
              </div>
              <Button
                kind="tertiary"
                renderIcon={Download}
                onClick={async () => {
                  try {
                    await exportContestResults(contestId!);
                    setNotification({
                      kind: "success",
                      message: t("settings.exportSuccess"),
                    });
                  } catch (error: any) {
                    setNotification({
                      kind: "error",
                      message: error.message || t("settings.exportFailed"),
                    });
                  }
                }}
              >
                {t("settings.exportCSV")}
              </Button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div
          style={{
            marginTop: "3rem",
            borderTop: "1px solid var(--cds-border-subtle)",
            paddingTop: "2rem",
          }}
        >
          <h4 style={{ color: "var(--cds-text-error)", marginBottom: "1rem" }}>
            {t("settings.dangerZone")}
          </h4>
          <div
            style={{
              border: "1px solid var(--cds-support-error)",
              borderRadius: "4px",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600 }}>
                  {t("settings.archiveContest")}
                </h5>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("settings.archiveDesc")}
                </p>
              </div>
              <Button
                kind="danger--ghost"
                onClick={handleArchive}
                disabled={contextContest?.status === "archived"}
              >
                {contextContest?.status === "archived"
                  ? t("settings.alreadyArchived")
                  : tc("button.archive")}
              </Button>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--cds-border-subtle)",
                margin: "1rem 0",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600 }}>
                  {t("settings.publishToPractice")}
                </h5>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("settings.publishToPracticeDesc")}
                </p>
              </div>
              <Button
                kind="secondary"
                onClick={() => setPublishModalOpen(true)}
                disabled={contextContest?.status !== "archived" || publishing}
              >
                {contextContest?.status === "archived"
                  ? t("settings.publishToPractice")
                  : t("settings.publishToPracticeHint")}
              </Button>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--cds-border-subtle)",
                margin: "1rem 0",
              }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h5 style={{ fontWeight: 600 }}>
                  {t("settings.deleteContest")}
                </h5>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {t("settings.deleteDesc")}
                </p>
              </div>
              <Button kind="danger" onClick={handleDelete}>
                {tc("button.delete")}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <Modal
        open={publishModalOpen}
        modalHeading={t("settings.publishToPracticeConfirmTitle")}
        primaryButtonText={t("settings.publishToPracticeConfirm")}
        secondaryButtonText={tc("button.cancel")}
        primaryButtonDisabled={publishing}
        onRequestClose={() => !publishing && setPublishModalOpen(false)}
        onRequestSubmit={handlePublishToPractice}
      >
        <p style={{ marginBottom: "0.5rem" }}>
          {t("settings.publishToPracticeConfirmDesc")}
        </p>
        <p style={{ color: "var(--cds-text-secondary)" }}>
          {t("settings.publishToPracticeIrreversible")}
        </p>
      </Modal>
      <ConfirmModal {...modalProps} />
    </SurfaceSection>
  );
};

export default ContestAdminSettingsPage;
