import React, { useEffect, useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loading, Button } from "@carbon/react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useContest } from "@/features/contest/contexts/ContestContext";
import {
  archiveContest,
  deleteContest,
} from "@/infrastructure/api/repositories";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { useToast } from "@/shared/contexts";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { ExamEditProvider, useExamEdit } from "./contexts/ExamEditContext";
import {
  DEFAULT_EXAM_FORM_VALUES,
  type ExamFormSchema,
} from "./forms/examFormSchema";
import { examFormSchema } from "./forms/examFormValidation";
import ExamEditHeader from "./components/ExamEditHeader";
import ExamEditSections from "./components/ExamEditSections";
import "./screen.scss";

const ExamEditScreenContent: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const { contest } = useContest();
  const { autoSave } = useExamEdit();
  const { showToast } = useToast();
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);

  const handleArchive = useCallback(async () => {
    if (!contestId) return;
    try {
      await archiveContest(contestId);
      showToast({ kind: "success", title: "競賽已封存" });
      navigate(`/contests`);
    } catch (err) {
      showToast({
        kind: "error",
        title: "封存失敗",
        subtitle: err instanceof Error ? err.message : "請稍後再試",
      });
    }
  }, [contestId, navigate, showToast]);

  const handleDelete = useCallback(async () => {
    if (!contestId) return;
    try {
      await deleteContest(contestId);
      showToast({ kind: "success", title: "競賽已刪除", subtitle: "正在跳轉..." });
      setTimeout(() => navigate("/contests"), 1000);
    } catch (err) {
      showToast({
        kind: "error",
        title: "刪除失敗",
        subtitle: err instanceof Error ? err.message : "請稍後再試",
      });
    }
  }, [contestId, navigate, showToast]);

  return (
    <div className="exam-edit-page">
      <ExamEditHeader
        title={`考試編輯 — ${contest?.name || "載入中..."}`}
        onBack={() => navigate(`/contests/${contestId}?tab=overview`)}
        globalSaveStatus={<GlobalSaveStatus status={autoSave.globalStatus} />}
      />
      <div className="exam-edit-page__main">
        <div className="exam-edit-page__content">
          <ExamEditSections
            contestId={contestId || ""}
            contestName={contest?.name || ""}
            contest={contest}
            questions={questions}
            onQuestionsChange={setQuestions}
          />
        </div>
      </div>
    </div>
  );
};

const ExamEditScreen: React.FC = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contest, loading } = useContest();

  const canEdit = user && (user.role === "admin" || user.role === "teacher");

  const methods = useForm<ExamFormSchema>({
    defaultValues: DEFAULT_EXAM_FORM_VALUES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(examFormSchema) as any,
    mode: "onBlur",
  });

  const { reset } = methods;

  // Populate form from contest data
  useEffect(() => {
    if (!contest) return;
    reset({
      name: contest.name ?? "",
      description: contest.description ?? "",
      rules: contest.rules ?? "",
      startTime: contest.startTime ?? "",
      endTime: contest.endTime ?? "",
      status: contest.status ?? "draft",
      visibility: contest.visibility ?? "public",
      password: contest.password ?? "",
      examModeEnabled: contest.examModeEnabled ?? false,
      maxCheatWarnings: contest.maxCheatWarnings ?? 3,
      allowMultipleJoins: contest.allowMultipleJoins ?? false,
      allowAutoUnlock: contest.allowAutoUnlock ?? false,
      autoUnlockMinutes: contest.autoUnlockMinutes ?? 5,
    });
  }, [contest, reset]);

  if (!canEdit) {
    return (
      <div className="exam-edit-page">
        <ExamEditHeader
          title="考試編輯"
          onBack={() => navigate(`/contests/${contestId}`)}
        />
        <div className="exam-edit-page__error">
          <h3>權限不足</h3>
          <p>只有管理員和教師可以編輯考試設定。</p>
          <Button onClick={() => navigate(`/contests/${contestId}`)}>
            返回競賽
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !contest) {
    return (
      <div className="exam-edit-page">
        <ExamEditHeader
          title="考試編輯"
          onBack={() => navigate(`/contests/${contestId}`)}
        />
        <div className="exam-edit-page__loading">
          <Loading withOverlay={false} />
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="exam-edit-page">
        <ExamEditHeader
          title="考試編輯"
          onBack={() => navigate(`/contests/${contestId}`)}
        />
        <div className="exam-edit-page__error">
          <h3>找不到競賽</h3>
          <p>此競賽不存在或已被刪除。</p>
          <Button onClick={() => navigate("/contests")}>
            返回競賽列表
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <ExamEditProvider contestId={contestId || ""}>
        <ExamEditScreenContent />
      </ExamEditProvider>
    </FormProvider>
  );
};

export default ExamEditScreen;
