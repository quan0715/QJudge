/**
 * MarkdownContent - Pre-configured Markdown rendering components
 *
 * Provides consistent Markdown rendering across the application with
 * predefined configurations for common use cases.
 *
 * @example
 * // For documentation pages (full features)
 * <MarkdownContent.Documentation>{content}</MarkdownContent.Documentation>
 *
 * // For problem descriptions (math + code highlighting)
 * <MarkdownContent.Problem>{content}</MarkdownContent.Problem>
 *
 * // For simple text content (basic markdown only)
 * <MarkdownContent.Simple>{content}</MarkdownContent.Simple>
 */
import MarkdownRenderer from "./MarkdownRenderer";

interface MarkdownContentProps {
  children: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Documentation content - Full featured markdown
 * Use for: Documentation pages, help articles
 * Features: Math (KaTeX), Syntax highlighting, Copy button
 */
const Documentation: React.FC<MarkdownContentProps> = ({
  children,
  className,
  style,
}) => (
  <MarkdownRenderer
    enableMath
    enableHighlight
    enableCopy
    className={className}
    style={style}
  >
    {children}
  </MarkdownRenderer>
);

/**
 * Problem content - Math and code highlighting
 * Use for: Problem descriptions, input/output descriptions, hints
 * Features: Math (KaTeX), Syntax highlighting
 */
const Problem: React.FC<MarkdownContentProps> = ({
  children,
  className,
  style,
}) => (
  <MarkdownRenderer
    enableMath
    enableHighlight
    className={className}
    style={style}
  >
    {children}
  </MarkdownRenderer>
);

/**
 * Simple content - Basic markdown only
 * Use for: Contest descriptions, rules, short text
 * Features: Basic markdown (bold, italic, links, lists)
 */
const Simple: React.FC<MarkdownContentProps> = ({
  children,
  className,
  style,
}) => (
  <MarkdownRenderer className={className} style={style}>
    {children}
  </MarkdownRenderer>
);

/**
 * Rich content - Math support without code highlighting
 * Use for: Mathematical content without code blocks
 * Features: Math (KaTeX)
 */
const Rich: React.FC<MarkdownContentProps> = ({
  children,
  className,
  style,
}) => (
  <MarkdownRenderer enableMath className={className} style={style}>
    {children}
  </MarkdownRenderer>
);

const MarkdownContent = {
  Documentation,
  Problem,
  Simple,
  Rich,
};

export default MarkdownContent;
