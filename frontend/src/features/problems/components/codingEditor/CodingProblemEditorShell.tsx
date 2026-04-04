import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@carbon/react";
import { Download, Upload, View } from "@carbon/icons-react";
import type { ProblemYAML } from "@/shared/utils/problemYamlParser";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import { GlobalSaveStatus } from "@/features/problems/components/edit/common";
import { TriggerModal, type TriggerModalHandle } from "@/shared/ui/modal";
import { ProblemImportModal } from "@/features/problems/components/modals";
import ProblemEditHeader from "@/features/problems/screens/problemsIdEdit/components/ProblemEditHeader";
import ProblemEditSections from "@/features/problems/screens/problemsIdEdit/components/ProblemEditSections";
import ProblemEditPreviewModal from "@/features/problems/screens/problemsIdEdit/components/ProblemEditPreviewModal";
import ProblemEditExportModal from "@/features/problems/screens/problemsIdEdit/components/ProblemEditExportModal";
import { formSchemaToPreview } from "@/features/problems/screens/problemsIdEdit/utils/previewAdapter";
import "@/features/problems/screens/problemsIdEdit/screen.scss";
import styles from "./CodingProblemEditorShell.module.scss";

interface CodingProblemEditorShellProps {
  title: string;
  formValues: ProblemFormSchema;
  onDelete: () => Promise<void>;
  hideBackButton?: boolean;
  hideHeader?: boolean;
  onBack?: () => void;
  onImportYaml?: (yamlData: ProblemYAML) => void;
  onExportConfirm?: (args: {
    exportFormat: "pdf" | "yaml";
    pdfScale: number;
    close: () => void;
  }) => void;
  showPreview?: boolean;
  showGlobalSaveStatus?: boolean;
  onGlobalSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
  extraActions?: React.ReactNode;
  onToolbarActionsReady?: (actions: React.ReactNode) => void;
}

const CodingProblemEditorShell: React.FC<CodingProblemEditorShellProps> = ({
  title,
  formValues,
  onDelete,
  hideBackButton = true,
  hideHeader = false,
  onBack,
  onImportYaml,
  onExportConfirm,
  showPreview = true,
  showGlobalSaveStatus = true,
  onGlobalSaveStatusChange,
  extraActions,
  onToolbarActionsReady,
}) => {
  const { autoSave } = useProblemEdit();
  const previewModalRef = React.useRef<TriggerModalHandle>(null);
  const [exportFormat, setExportFormat] = useState<"pdf" | "yaml">("pdf");
  const [pdfScale, setPdfScale] = useState(100);

  const previewData = useMemo(() => formSchemaToPreview(formValues), [formValues]);

  useEffect(() => {
    onGlobalSaveStatusChange?.(autoSave.globalStatus);
  }, [autoSave.globalStatus, onGlobalSaveStatusChange]);

  const actionButtons = useMemo(
    () => (
      <>
        {onImportYaml ? (
          <TriggerModal
            trigger={
              <Button kind="ghost" renderIcon={Upload} size="sm" hasIconOnly iconDescription="Import">
                Import
              </Button>
            }
            renderModal={({ open, onClose }) => (
              <ProblemImportModal
                open={open}
                onClose={onClose}
                onPopulate={onImportYaml}
                mode="populateForm"
              />
            )}
          />
        ) : null}
        {onExportConfirm ? (
          <TriggerModal
            trigger={
              <Button kind="ghost" renderIcon={Download} size="sm" hasIconOnly iconDescription="Export">
                Export
              </Button>
            }
            renderModal={({ open, onClose }) => (
              <ProblemEditExportModal
                open={open}
                onClose={onClose}
                onConfirm={() =>
                  onExportConfirm({
                    exportFormat,
                    pdfScale,
                    close: onClose,
                  })
                }
                exportFormat={exportFormat}
                onExportFormatChange={setExportFormat}
                pdfScale={pdfScale}
                onPdfScaleChange={setPdfScale}
              />
            )}
          />
        ) : null}
        {extraActions}
      </>
    ),
    [onImportYaml, onExportConfirm, exportFormat, pdfScale, extraActions]
  );

  useEffect(() => {
    onToolbarActionsReady?.(actionButtons);
  }, [actionButtons, onToolbarActionsReady]);

  return (
    <div className={styles.editorRoot}>
      {!hideHeader && (
        <ProblemEditHeader
          title={title || "Untitled"}
          onBack={onBack || (() => {})}
          hideBackButton={hideBackButton}
          globalSaveStatus={
            showGlobalSaveStatus ? <GlobalSaveStatus status={autoSave.globalStatus} /> : undefined
          }
          actions={
            <>
              {actionButtons}
              {showPreview ? (
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={View}
                  onClick={() => previewModalRef.current?.open()}
                >
                  Preview
                </Button>
              ) : null}
            </>
          }
        />
      )}

      <div className={styles.editorContent}>
        <ProblemEditSections
          problemTitle={title}
          onDelete={onDelete}
        />
      </div>

      {showPreview ? (
        <TriggerModal
          ref={previewModalRef}
          renderModal={({ open, onClose }) => (
            <ProblemEditPreviewModal
              open={open}
              onClose={onClose}
              previewData={previewData}
            />
          )}
        />
      ) : null}
    </div>
  );
};

export default CodingProblemEditorShell;
