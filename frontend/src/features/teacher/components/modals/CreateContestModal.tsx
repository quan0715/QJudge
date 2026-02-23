import React, { useState } from "react";
import {
  Modal,
  TextInput,
  Form,
  InlineNotification,
  DatePicker,
  DatePickerInput,
  TimePicker,
  Grid,
  Column,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { createContest } from "@/infrastructure/api/repositories/contest.repository";

interface CreateContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contestId?: string) => void;
}

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
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState("17:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setStartDate(null);
    setStartTime("09:00");
    setEndDate(null);
    setEndTime("17:00");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const combineDateTime = (date: Date | null, time: string): string | null => {
    if (!date) return null;
    const [hours, minutes] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined.toISOString();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;

    const startDateTime = combineDateTime(startDate, startTime);
    const endDateTime = combineDateTime(endDate, endTime);

    if (!startDateTime || !endDateTime) {
      setError(t("validation.invalidDateTime", "請選擇有效的開始和結束時間"));
      return;
    }

    if (new Date(startDateTime) >= new Date(endDateTime)) {
      setError(t("validation.endBeforeStart", "結束時間必須晚於開始時間"));
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
        visibility: "public",
      });
      onCreated(createdContest.id);
      handleClose();
    } catch (err: any) {
      setError(err.message || t("error.createFailed", "建立競賽失敗"));
    } finally {
      setLoading(false);
    }
  };

  const isValid = name && startDate && endDate;

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      modalHeading={tc("page.createContest")}
      primaryButtonText={tc("button.create")}
      secondaryButtonText={tc("button.cancel")}
      onRequestSubmit={handleSubmit}
      onSecondarySubmit={handleClose}
      primaryButtonDisabled={!isValid || loading}
      size="md"
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

        <TextInput
          id="contest-name"
          labelText={tc("form.name")}
          placeholder={t("placeholder.contestName", "輸入競賽名稱")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ marginBottom: "1.5rem" }}
        />

        <Grid narrow style={{ marginBottom: "1rem" }}>
          <Column lg={8} md={4} sm={4}>
            <DatePicker
              datePickerType="single"
              onChange={([date]) => setStartDate(date)}
              value={startDate ? [startDate] : []}
            >
              <DatePickerInput
                id="start-date"
                labelText={tc("form.startDate")}
                placeholder="yyyy/mm/dd"
              />
            </DatePicker>
          </Column>
          <Column lg={8} md={4} sm={4}>
            <TimePicker
              id="start-time"
              labelText={tc("form.startTime", "開始時間")}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Column>
        </Grid>

        <Grid narrow>
          <Column lg={8} md={4} sm={4}>
            <DatePicker
              datePickerType="single"
              onChange={([date]) => setEndDate(date)}
              value={endDate ? [endDate] : []}
            >
              <DatePickerInput
                id="end-date"
                labelText={tc("form.endDate")}
                placeholder="yyyy/mm/dd"
              />
            </DatePicker>
          </Column>
          <Column lg={8} md={4} sm={4}>
            <TimePicker
              id="end-time"
              labelText={tc("form.endTime", "結束時間")}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Column>
        </Grid>
      </Form>
    </Modal>
  );
};

export default CreateContestModal;
