import { Link, useLocation } from "react-router-dom";
import { Home, ArrowLeft } from "@carbon/icons-react";

interface Props {
  classroomId: string;
  contestId: string;
  compact?: boolean;
}

export const SideMenuContestIdleSection = ({ classroomId, contestId, compact }: Props) => {
  const { pathname } = useLocation();
  const dashboardPath = `/classrooms/${classroomId}/contest/${contestId}`;
  const isDashboard = pathname === dashboardPath;
  const classroomPath = `/classrooms/${classroomId}`;

  const itemBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: compact ? "0.5rem" : "0.75rem 1rem",
    borderRadius: "0.25rem",
    color: "var(--cds-text-primary)",
    textDecoration: "none",
  };

  return (
    <nav
      aria-label="Contest navigation"
      style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}
    >
      <Link to={classroomPath} style={itemBase}>
        <ArrowLeft size={20} />
        {!compact && <span>返回教室</span>}
      </Link>
      <Link
        to={dashboardPath}
        style={{
          ...itemBase,
          background: isDashboard ? "var(--cds-layer-accent)" : "transparent",
          fontWeight: isDashboard ? 600 : 400,
        }}
        aria-current={isDashboard ? "page" : undefined}
      >
        <Home size={20} />
        {!compact && <span>競賽主頁</span>}
      </Link>
    </nav>
  );
};

export default SideMenuContestIdleSection;
