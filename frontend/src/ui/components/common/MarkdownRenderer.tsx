import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import '@/styles/markdown.css';

interface MarkdownRendererProps {
  children: string;
  /** Include math rendering (KaTeX) */
  enableMath?: boolean;
  /** Include syntax highlighting for code blocks */
  enableHighlight?: boolean;
  /** Additional className for styling */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Unified Markdown renderer component with consistent plugins.
 * 
 * Features:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Raw HTML support (aside, div, etc.)
 * - Math formulas with KaTeX (optional)
 * - Syntax highlighting (optional)
 * 
 * @example
 * // Basic usage
 * <MarkdownRenderer>{markdownContent}</MarkdownRenderer>
 * 
 * // With math formulas
 * <MarkdownRenderer enableMath>{contentWithMath}</MarkdownRenderer>
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  children,
  enableMath = false,
  enableHighlight = false,
  className = '',
  style
}) => {
  // Build plugins based on options
  const remarkPlugins: any[] = [remarkGfm];
  const rehypePlugins: any[] = [rehypeRaw];

  if (enableMath) {
    remarkPlugins.push(remarkMath);
    rehypePlugins.push(rehypeKatex);
  }

  if (enableHighlight) {
    rehypePlugins.push(rehypeHighlight);
  }

  return (
    <div className={`markdown-body ${className}`.trim()} style={style}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
