import { Link } from 'react-router-dom';

interface ProblemLinkProps {
  problemId: string;
  displayId?: string;
  title?: string;
  contestId?: string;
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
  displayId,
  title,
  contestId,
  children,
  style,
  className
}: ProblemLinkProps) => {
  // Determine the correct route
  const to = contestId
    ? `/contests/${contestId}/problems/${displayId || problemId}`
    : `/problems/${displayId || problemId}`;

  // Display text: use children if provided, otherwise title, otherwise displayId/problemId
  const displayText = children || title || displayId || `Problem ${problemId}`;

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
