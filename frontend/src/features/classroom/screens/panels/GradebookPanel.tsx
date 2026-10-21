import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataTableSkeleton } from "@carbon/react";
import { Report } from "@carbon/icons-react";
import type {
  ClassroomDetail,
  ClassroomGradebook,
} from "@/core/entities/classroom.entity";
import {
  exportClassroomGradebook,
  getClassroomGradebook,
} from "@/infrastructure/api/repositories/classroom.repository";
import { useToast } from "@/shared/contexts/ToastContext";
import { EmptyState } from "@/shared/ui/EmptyState";
import { GradebookTable } from "../../components/GradebookTable";

interface GradebookPanelProps {
  classroom: ClassroomDetail;
}

/** `gradebook: null` means loading that classroom failed. */
interface GradebookResult {
  classroomId: string;
  gradebook: ClassroomGradebook | null;
}

export const GradebookPanel: React.FC<GradebookPanelProps> = ({ classroom }) => {
  const { t } = useTranslation("classroom");
  const { showToast } = useToast();
  const [result, setResult] = useState<GradebookResult | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClassroomGradebook(classroom.id).then(
      (gradebook) => {
        if (!cancelled) setResult({ classroomId: classroom.id, gradebook });
      },
      () => {
        if (!cancelled) setResult({ classroomId: classroom.id, gradebook: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [classroom.id]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportClassroomGradebook(classroom.id);
    } catch {
      showToast({
        kind: "error",
        title: t("gradebook.exportFailed", "匯出失敗"),
      });
    } finally {
      setExporting(false);
    }
  }, [classroom.id, showToast, t]);

  const current = result?.classroomId === classroom.id ? result : null;

  if (!current) {
    return <DataTableSkeleton columnCount={5} rowCount={6} showToolbar />;
  }

  if (!current.gradebook) {
    return (
      <EmptyState
        icon={Report}
        title={t("gradebook.loadFailed", "無法載入成績總表")}
      />
    );
  }

  return (
    <GradebookTable
      gradebook={current.gradebook}
      onExport={() => {
        void handleExport();
      }}
      exporting={exporting}
    />
  );
};
