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

  if (loading) {
    return <Loading description={t("common:message.loading", "載入問答資料")} />;
  }
  if (!contest) return <div>{t("clarifications.notFound")}</div>;

  return (
    <div style={{ maxWidth, margin: maxWidth ? "0 auto" : undefined, padding: "1rem" }}>
      <ContestClarifications
        contestId={contest.id}
        mode="participate"
        problems={contest.problems}
        contestStatus={contest.status}
        contestEndTime={contest.endTime}
      />
    </div>
  );
};

export default ContestQAScreen;
