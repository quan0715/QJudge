import { useEffect, useMemo, useState } from "react";
import {
  DatePicker,
  DatePickerInput,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  TimePicker,
  TimePickerSelect,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

type Meridiem = "AM" | "PM";

interface PublishScheduleModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }) => Promise<void>;
}

const DURATION_OPTIONS = [60, 90, 120, 180, 240];

const getDefaultSchedule = (): {
  startDate: Date;
  startTime: string;
  startMeridiem: Meridiem;
} => {
  const now = new Date();
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);

  const minutes = rounded.getMinutes();
  if (minutes > 0 && minutes < 30) {
    rounded.setMinutes(30);
  } else if (minutes > 30) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  }

  rounded.setHours(rounded.getHours() + 2);

  const hours24 = rounded.getHours();
  const startMeridiem: Meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12Raw = hours24 % 12;
  const hours12 = hours12Raw === 0 ? 12 : hours12Raw;
  const startTime = `${String(hours12).padStart(2, "0")}:${String(
    rounded.getMinutes(),
  ).padStart(2, "0")}`;

  return {
    startDate: rounded,
    startTime,
    startMeridiem,
  };
};

const combineDateTime = (
  date: Date | null,
  time: string,
  meridiem: Meridiem,
): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 1 ||
    hours > 12 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const combined = new Date(date);
  const normalizedHours =
    meridiem === "PM" ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
  combined.setHours(normalizedHours, minutes, 0, 0);
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
};

export default function PublishScheduleModal({
  open,
  loading = false,
  onClose,
  onConfirm,
}: PublishScheduleModalProps) {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState("06:00");
  const [startMeridiem, setStartMeridiem] = useState<Meridiem>("PM");
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const defaults = getDefaultSchedule();
    setStartDate(defaults.startDate);
    setStartTime(defaults.startTime);
    setStartMeridiem(defaults.startMeridiem);
    setDurationMinutes("120");
    setError("");
  }, [open]);

  const startDateTime = useMemo(
    () => combineDateTime(startDate, startTime, startMeridiem),
    [startDate, startMeridiem, startTime],
  );
  const duration = useMemo(() => Number.parseInt(durationMinutes, 10), [durationMinutes]);
  const endDateTime = useMemo(() => {
    if (!startDateTime || Number.isNaN(duration) || duration <= 0) return null;
    return new Date(new Date(startDateTime).getTime() + duration * 60 * 1000).toISOString();
  }, [duration, startDateTime]);

  const canSubmit = !!startDate && !!startDateTime && !!endDateTime && duration > 0;

  return (
    <Modal
      open={open}
      modalHeading={t("adminOverview.publishSchedule.title", "設定發布時段")}
      modalLabel={t("adminOverview.publishSchedule.label", "發布競賽")}
      primaryButtonText={t("adminOverview.actions.publishContest", "發布競賽")}
      secondaryButtonText={tc("button.cancel")}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => {
        if (!startDateTime || !endDateTime || Number.isNaN(duration) || duration <= 0) {
          setError(t("validation.invalidDateTime", "請輸入有效的日期與時間"));
          return;
        }
        void onConfirm({
          startTime: startDateTime,
          endTime: endDateTime,
          durationMinutes: duration,
        });
      }}
      primaryButtonDisabled={!canSubmit || loading}
      size="sm"
      hasScrollingContent
      selectorPrimaryFocus="#publish-start-time"
    >
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

      <DatePicker
        datePickerType="single"
        onChange={([date]) => setStartDate(date)}
        value={startDate ? [startDate] : []}
      >
        <DatePickerInput
          id="publish-start-date"
          labelText={t("createModal.startDateLabel", "開始日期")}
          placeholder={t("createModal.startDatePlaceholder", "YYYY/MM/DD")}
        />
      </DatePicker>

      <div style={{ marginTop: "1rem" }}>
        <TimePicker
          id="publish-start-time"
          labelText={t("createModal.startTimeLabel", "開始時間")}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          placeholder={t("createModal.startTimePlaceholder", "HH:MM")}
        >
          <TimePickerSelect
            id="publish-start-meridiem"
            value={startMeridiem}
            onChange={(e) => setStartMeridiem(e.target.value as Meridiem)}
          >
            <SelectItem value="AM" text="AM" />
            <SelectItem value="PM" text="PM" />
          </TimePickerSelect>
        </TimePicker>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Select
          id="publish-duration-minutes"
          labelText={t("createModal.duration", "作答時長")}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
        >
          {DURATION_OPTIONS.map((minutes) => (
            <SelectItem
              key={minutes}
              value={String(minutes)}
              text={`${minutes} ${t("createModal.durationUnit", "分鐘")}`}
            />
          ))}
        </Select>
      </div>
    </Modal>
  );
}
