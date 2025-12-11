import ContestClarifications from "@/domains/contest/components/ContestClarifications";
import { Loading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import { useContest } from "@/domains/contest/contexts/ContestContext";

interface ContestQAPageProps {
  maxWidth?: string;
}

const ContestQAPage: React.FC<ContestQAPageProps> = ({ maxWidth }) => {
  const { t } = useTranslation("contest");
  const { contest, loading } = useContest();

  if (loading) return <Loading />;
  if (!contest) return <div>{t("clarifications.notFound")}</div>;

  return (
    <SurfaceSection maxWidth={maxWidth} style={{ minHeight: "100%", flex: 1 }}>
      <div className="cds--grid" style={{ padding: 0 }}>
        <div className="cds--row">
          <div className="cds--col-lg-16">
            <ContainerCard title={t("clarifications.title")}>
              <p
                style={{
                  marginBottom: "1.5rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {t("clarifications.subtitle", { name: contest.name })}
              </p>
              <ContestClarifications
                contestId={contest.id}
                isTeacherOrAdmin={["teacher", "admin"].includes(
                  contest.currentUserRole || ""
                )}
                problems={contest.problems}
                contestStatus={contest.status}
              />
            </ContainerCard>
          </div>
        </div>
      </div>
    </SurfaceSection>
  );
};

export default ContestQAPage;
