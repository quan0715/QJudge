import React, { useCallback, useEffect, useState } from "react";
import { InlineNotification, Loading } from "@carbon/react";
import { useParams } from "react-router-dom";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";
import ContestSolveScreen from "@/features/contest/screens/ContestSolveScreen";
import type { ClassroomLabDetail } from "@/core/entities/classroom.entity";
import { getClassroomLabSolve } from "@/infrastructure/api/repositories/classroom.repository";

const ClassroomLabSolveScreen: React.FC = () => {
  const { classroomId, labId } = useParams<{ classroomId: string; labId: string }>();
  const [lab, setLab] = useState<ClassroomLabDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classroomId || !labId) return;
    setLoading(true);
    setError(null);
    try {
      setLab(await getClassroomLabSolve(classroomId, labId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lab");
    } finally {
      setLoading(false);
    }
  }, [classroomId, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <Loading withOverlay={false} />;
  }

  if (!lab) {
    return (
      <InlineNotification
        kind="error"
        title="載入作答資料失敗"
        subtitle={error || "請稍後再試"}
        hideCloseButton
        lowContrast
      />
    );
  }

  return (
    <ContestProvider
      contestId={lab.labId}
      initialContest={lab.contest}
      onRefresh={load}
    >
      <ContestSolveScreen />
    </ContestProvider>
  );
};

export default ClassroomLabSolveScreen;
