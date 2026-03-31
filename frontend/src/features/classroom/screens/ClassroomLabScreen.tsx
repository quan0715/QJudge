import React, { useCallback, useEffect, useState } from "react";
import { Button, InlineNotification, Loading, Tag } from "@carbon/react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ClassroomLabDetail } from "@/core/entities/classroom.entity";
import {
  acceptClassroomLab,
  getClassroomLab,
} from "@/infrastructure/api/repositories/classroom.repository";
import { getClassroomContestDashboardPath } from "@/features/contest/domain/contestRoutePolicy";

const ClassroomLabScreen: React.FC = () => {
  const { t } = useTranslation("classroom");
  const navigate = useNavigate();
  const { classroomId, labId } = useParams<{ classroomId: string; labId: string }>();
  const [lab, setLab] = useState<ClassroomLabDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!classroomId || !labId) return;
    setLoading(true);
    setError(null);
    try {
      setLab(await getClassroomLab(classroomId, labId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lab");
    } finally {
      setLoading(false);
    }
  }, [classroomId, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = async () => {
    if (!classroomId || !labId) return;
    setAccepting(true);
    setError(null);
    try {
      const next = await acceptClassroomLab(classroomId, labId);
      setLab(next);
      navigate(`/classrooms/${classroomId}/labs/${labId}/solve`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept lab");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return <Loading withOverlay={false} />;
  }

  if (!lab) {
    return (
      <InlineNotification
        kind="error"
        title={t("lab.loadFailed", "載入練習失敗")}
        subtitle={error || t("loadFailedHint", "請稍後再試")}
        hideCloseButton
        lowContrast
      />
    );
  }

  const canEnter = lab.assignmentState !== "unaccepted";
  const canEdit = !!lab.contest.permissions?.canEditContest;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      {error ? (
        <InlineNotification
          kind="error"
          title={t("lab.actionFailed", "操作失敗")}
          subtitle={error}
          hideCloseButton
          lowContrast
          style={{ marginBottom: "1rem" }}
        />
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <Tag type="cyan">{lab.contestType === "paper_exam" ? "paper-like" : "coding"}</Tag>
        <Tag type={lab.endTime ? "purple" : "teal"}>
          {lab.endTime ? t("lab.assignment", "作業") : t("lab.practice", "練習")}
        </Tag>
        <Tag type={lab.status === "published" ? "green" : "gray"}>{lab.status}</Tag>
      </div>
      <h1 style={{ marginBottom: "0.75rem" }}>{lab.name}</h1>
      {lab.description ? <p style={{ marginBottom: "1rem" }}>{lab.description}</p> : null}
      {lab.endTime ? (
        <p style={{ marginBottom: "1rem" }}>
          {t("lab.dueTime", "截止時間")}: {new Date(lab.endTime).toLocaleString()}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        {canEnter ? (
          <Button onClick={() => navigate(`/classrooms/${classroomId}/labs/${labId}/solve`)}>
            {t("lab.enterSolve", "進入作答")}
          </Button>
        ) : (
          <Button onClick={() => void handleAccept()} disabled={accepting}>
            {accepting ? t("lab.accepting", "接受中") : t("lab.accept", "接受作業")}
          </Button>
        )}
        <Button kind="tertiary" onClick={() => navigate(`/classrooms/${classroomId}`)}>
          {t("lab.backToClassroom", "返回教室")}
        </Button>
        {canEdit ? (
          <Button
            kind="secondary"
            onClick={() => navigate(getClassroomContestDashboardPath(classroomId!, lab.labId))}
          >
            {t("lab.openEditor", "開啟編輯")}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default ClassroomLabScreen;
