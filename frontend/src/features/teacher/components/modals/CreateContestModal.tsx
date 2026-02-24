import React, { useState } from "react";
import {
  Modal,
  TextInput,
  Form,
  InlineNotification,
  DatePicker,
  DatePickerInput,
  TimePicker,
  Toggle,
} from "@carbon/react";
import { Code, Education, Time, Calendar } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { createContest } from "@/infrastructure/api/repositories/contest.repository";
import styles from "./CreateContestModal.module.scss";

interface CreateContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contestId?: string) => void;
}

type ContestCreationType = "coding_test" | "exam";

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [creationType, setCreationType] =
    useState<ContestCreationType>("coding_test");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setStartDate(null);
    setStartTime("09:00");
    setDurationMinutes("120");
    setIsPrivate(false);
    setPassword("");
    setCreationType("coding_test");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const combineDateTime = (date: Date | null, time: string): string | null => {
    if (!date) return null;
    const [hours, minutes] = time.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  };

  const getComputedEndDate = (): Date | null => {
    const startDateTime = combineDateTime(startDate, startTime);
    const duration = Number.parseInt(durationMinutes, 10);

    if (!startDateTime || Number.isNaN(duration) || duration <= 0) {
      return null;
    }

    return new Date(new Date(startDateTime).getTime() + duration * 60 * 1000);
  };

  const computedEndDate = getComputedEndDate();
  const computedEndText = computedEndDate
    ? new Intl.DateTimeFormat("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(computedEndDate)
    : "請先設定開始時間與有效的比賽長度";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate) return;

    const startDateTime = combineDateTime(startDate, startTime);
    const duration = Number.parseInt(durationMinutes, 10);

    if (!startDateTime) {
      setError(t("validation.invalidDateTime", "請選擇有效的開始時間"));
      return;
    }

    if (Number.isNaN(duration) || duration <= 0) {
      setError("比賽長度必須是大於 0 的分鐘數");
      return;
    }

    if (isPrivate && !password.trim()) {
      setError("私人競賽必須設定密碼");
      return;
    }

    const endDateTime = computedEndDate?.toISOString();
    if (!endDateTime) {
      setError("無法計算結束時間，請檢查開始時間與比賽長度");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const createdContest = await createContest({
        name,
        description: "",
        start_time: startDateTime,
        end_time: endDateTime,
        visibility: isPrivate ? "private" : "public",
        password: isPrivate ? password : undefined,
        exam_mode_enabled: creationType === "exam",
      });
      onCreated(createdContest.id);
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("error.createFailed", "建立競賽失敗");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    !!name.trim() &&
    !!startDate &&
    Number.parseInt(durationMinutes, 10) > 0 &&
    (!isPrivate || !!password.trim());

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      modalHeading={
        creationType === "exam"
          ? "新增 Exam"
          : tc("page.createContest")
      }
      primaryButtonText={tc("button.create")}
      secondaryButtonText={tc("button.cancel")}
      onRequestSubmit={handleSubmit}
      onSecondarySubmit={handleClose}
      primaryButtonDisabled={!isValid || loading}
      size="lg"
    >
      <Form onSubmit={handleSubmit}>
        {error && (
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            style={{ marginBottom: "1rem" }}
            lowContrast
            hideCloseButton
          />
        )}

        <div className={styles.typeSelector}>
          <button
            type="button"
            onClick={() => setCreationType("coding_test")}
            className={`${styles.typeOption} ${
              creationType === "coding_test" ? styles.typeOptionActive : ""
            }`}
            aria-pressed={creationType === "coding_test"}
          >
            <Code size={24} />
            <span className={styles.typeTitle}>Coding Test</span>
            <span className={styles.typeSubtitle}>程式題為主，支援提交與判題</span>
          </button>
          <button
            type="button"
            onClick={() => setCreationType("exam")}
            className={`${styles.typeOption} ${
              creationType === "exam" ? styles.typeOptionActive : ""
            }`}
            aria-pressed={creationType === "exam"}
          >
            <Education size={24} />
            <span className={styles.typeTitle}>Exam</span>
            <span className={styles.typeSubtitle}>考卷題型，是非/選擇/問答</span>
          </button>
        </div>

        <div className={styles.modeDescription}>
          <strong>{creationType === "exam" ? "Exam 模式" : "Coding Test 模式"}</strong>
          <p>
            {creationType === "exam"
              ? "學生以卷面作答，問答題可由助教批改。"
              : "學生以程式題為主，走既有提交與排名流程。"}
          </p>
        </div>

        <TextInput
          id="contest-name"
          labelText={
            creationType === "exam" ? "Exam 名稱" : tc("form.name")
          }
          placeholder={t("placeholder.contestName", "輸入競賽名稱")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={styles.nameInput}
        />

        <div className={styles.formGrid}>
          <div className={styles.timeFieldsRow}>
            <div className={styles.fieldBlock}>
              <DatePicker
                datePickerType="single"
                onChange={([date]) => setStartDate(date)}
                value={startDate ? [startDate] : []}
                className={styles.dateField}
              >
                <DatePickerInput
                  id="start-date"
                  labelText={tc("form.startDate")}
                  placeholder="yyyy/mm/dd"
                />
              </DatePicker>
            </div>
            <div className={styles.fieldBlock}>
              <TimePicker
                id="start-time"
                labelText={tc("form.startTime", "開始時間")}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={styles.timeField}
              />
            </div>
            <div className={styles.fieldBlock}>
              <TextInput
                id="duration-minutes"
                labelText="比賽長度（分鐘）"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="120"
                required
              />
              <div className={styles.quickDuration}>
                {[60, 90, 120, 180].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setDurationMinutes(String(minutes))}
                    className={`${styles.quickDurationButton} ${
                      durationMinutes === String(minutes)
                        ? styles.quickDurationButtonActive
                        : ""
                    }`}
                  >
                    {minutes} 分
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.endTimeHint}>
          <div className={styles.endTimeHintTitle}>
            <Calendar size={16} />
            <span>預計結束時間</span>
          </div>
          <div className={styles.endTimeHintValue}>
            <Time size={16} />
            <strong>{computedEndText}</strong>
          </div>
        </div>

        <div className={styles.privacySection}>
          <Toggle
            id="contest-private"
            labelText="私人競賽"
            toggled={isPrivate}
            onToggle={(checked: boolean) => setIsPrivate(checked)}
            labelA="公開"
            labelB="私人"
          />
          {isPrivate && (
            <TextInput
              id="contest-password"
              labelText={t("hero.passwordLabel", "密碼")}
              placeholder={t("hero.passwordPlaceholder", "請輸入競賽密碼")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </div>
      </Form>
    </Modal>
  );
};

export default CreateContestModal;
