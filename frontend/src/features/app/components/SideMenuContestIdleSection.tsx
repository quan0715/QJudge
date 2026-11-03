import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Home } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";

interface Props {
  classroomId: string;
  contestId: string;
  /** kept for API parity with the runtime section; styling is driven by the parent .side-menu--mini class */
  compact?: boolean;
  hideClassroomBack?: boolean;
}

export const SideMenuContestIdleSection = ({
  classroomId,
  contestId,
  hideClassroomBack = false,
}: Props) => {
  const { pathname } = useLocation();
  const { t } = useTranslation("common");
  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const isDashboard = pathname === dashboardPath;
  const classroomPath = `/classrooms/${classroomId}`;

  return (
    <div className="side-menu__section">
      {!hideClassroomBack && (
        <Link to={classroomPath} className="side-menu__link">
          <ArrowLeft size={20} />
          <span>{t("nav.backToClassroom", "返回教室")}</span>
        </Link>
      )}
      <Link
        to={dashboardPath}
        className={`side-menu__link${isDashboard ? " side-menu__link--active" : ""}`}
        aria-current={isDashboard ? "page" : undefined}
      >
        <Home size={20} />
        <span>{t("workspaceTopNav.contestHome", "競賽主頁")}</span>
      </Link>
    </div>
  );
};

export default SideMenuContestIdleSection;
