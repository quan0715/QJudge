import { Link } from 'react-router-dom';

interface ProblemLinkProps {
  problemId: string;
  title?: string;
  contestId?: string;
  classroomId?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Reusable component for linking to problems.
 * Automatically handles contest vs practice problem routing.
 */
const ProblemLink = ({
  problemId,
  title,
  contestId,
  classroomId,
  children,
  style,
  className
}: ProblemLinkProps) => {
  // Determine the correct route
  const to = contestId && classroomId
    ? `/classrooms/${classroomId}/contest/${contestId}/problems/${problemId}`
    : `/problems/${problemId}`;

  const displayText = children || title || `Problem ${problemId}`;

  return (
    <Link
      to={to}
      style={{
        textDecoration: 'none',
        color: 'var(--cds-link-primary)',
        fontWeight: 500,
        ...style
      }}
      className={className}
    >
      {displayText}
    </Link>
  );
};

export default ProblemLink;
