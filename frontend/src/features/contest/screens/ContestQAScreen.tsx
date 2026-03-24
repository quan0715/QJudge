import ContestClarifications from "@/features/contest/components/ContestClarifications";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import { useContest } from "@/features/contest/contexts/ContestContext";

interface ContestQAScreenProps {
  maxWidth?: string;
}

const ContestQAScreen: React.FC<ContestQAScreenProps> = ({ maxWidth }) => {
  const { t } = useTranslation("contest");
  const { contest, loading } = useContest();

  if (loading) return <Loading />;
  if (!contest) return <div>{t("clarifications.notFound")}</div>;

  return (
    <div style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
      <h4 style={{ margin: "0 0 0.25rem", fontSize: "1rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
        {t("clarifications.title")}
      </h4>
      <p style={{ marginBottom: "1.5rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        {t("clarifications.subtitle", { name: contest.name })}
      </p>
      <ContestClarifications
        contestId={contest.id}
        isTeacherOrAdmin={contest.permissions?.canManageClarifications ?? false}
        problems={contest.problems}
        contestStatus={contest.status}
        contestEndTime={contest.endTime}
      />
    </div>
  );
};

export default ContestQAScreen;
