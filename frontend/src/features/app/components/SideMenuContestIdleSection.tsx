import { Link, useLocation } from "react-router-dom";
import { Home, ArrowLeft } from "@carbon/icons-react";

interface Props {
  classroomId: string;
  contestId: string;
  /** kept for API parity with the runtime section; styling is driven by the parent .side-menu--mini class */
  compact?: boolean;
}

export const SideMenuContestIdleSection = ({ classroomId, contestId }: Props) => {
  const { pathname } = useLocation();
  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const isDashboard = pathname === dashboardPath;
  const classroomPath = `/classrooms/${classroomId}`;

  return (
    <div className="side-menu__section">
      <Link to={classroomPath} className="side-menu__link">
        <ArrowLeft size={20} />
        <span>返回教室</span>
      </Link>
      <Link
        to={dashboardPath}
        className={`side-menu__link${isDashboard ? " side-menu__link--active" : ""}`}
        aria-current={isDashboard ? "page" : undefined}
      >
        <Home size={20} />
        <span>競賽主頁</span>
      </Link>
    </div>
  );
};

export default SideMenuContestIdleSection;
