import { CodeSnippet, InlineLoading, InlineNotification, Modal, Tab, TabList, TabPanel, TabPanels, Tabs } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { BatchQuestionFiles } from "./batchGradingApi";
import type { BatchQuestionState } from "./batchGradingModel";

interface BatchGradingFilesModalProps {
  open: boolean;
  state: BatchQuestionState;
  /** Undefined while loading. */
  files?: BatchQuestionFiles;
  error?: string;
  onClose(): void;
}

/** Read-only view of the rubric and draft grades the AI saved for one question's unit. */
export function BatchGradingFilesModal({ open, state, files, error, onClose }: BatchGradingFilesModalProps) {
  const { t } = useTranslation("contest");
  const json = (value: unknown) =>
    value ? <CodeSnippet type="multi">{JSON.stringify(value, null, 2)}</CodeSnippet> : <p>{t("grading.batch.filesMissing")}</p>;

  return (
    <Modal
      open={open}
      passiveModal
      size="lg"
      modalHeading={t("grading.batch.filesTitle", { label: state.label })}
      onRequestClose={onClose}
    >
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={error} />}
      {files === undefined && !error && <InlineLoading description={t("grading.batch.filesLoading")} />}
      {files !== undefined && (
        <Tabs>
          <TabList aria-label={t("grading.batch.filesTitle", { label: state.label })}>
            <Tab>{t("grading.batch.filesRubric")}</Tab>
            <Tab>{t("grading.batch.filesGrades")}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>{json(files?.rubric)}</TabPanel>
            <TabPanel>{json(files?.grades?.length ? files.grades : null)}</TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </Modal>
  );
}
