import {
  useState,
  useCallback,
  useMemo,
  isValidElement,
  Children,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { Copy, Checkmark } from "@carbon/icons-react";
import { IconButton, Tag } from "@carbon/react";

// Import highlight.js languages
import hljs from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import json from "highlight.js/lib/languages/json";
import sql from "highlight.js/lib/languages/sql";
import cssLang from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";

// Register languages
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("json", json);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("css", cssLang);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import "@/styles/markdown.css";

// Language display names
const LANGUAGE_LABELS: Record<string, string> = {
  cpp: "C++",
  c: "C",
  python: "Python",
  py: "Python",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  yaml: "YAML",
  yml: "YAML",
  json: "JSON",
  sql: "SQL",
  css: "CSS",
  html: "HTML",
  xml: "XML",
};

interface MarkdownRendererProps {
  children: string;
  /** Include math rendering (KaTeX) */
  enableMath?: boolean;
  /** Include syntax highlighting for code blocks */
  enableHighlight?: boolean;
  /** Enable copy button for code blocks */
  enableCopy?: boolean;
  /** Additional className for styling */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

// Extract language from code element className
const getLanguageFromClassName = (className?: string): string | null => {
  if (!className) return null;
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : null;
};

// Extract text content from React children
const extractTextContent = (children: React.ReactNode): string => {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map(extractTextContent).join("");
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    if (props.children) {
      return extractTextContent(props.children);
    }
  }
  return "";
};

// Code block with copy button and language label
const CodeBlock: React.FC<{
  children: React.ReactNode;
  enableCopy: boolean;
}> = ({ children, enableCopy }) => {
  const [copied, setCopied] = useState(false);

  // Extract language from code element
  const language: string | null = useMemo(() => {
    let foundLanguage: string | null = null;
    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        const props = child.props as { className?: string };
        if (props.className) {
          foundLanguage = getLanguageFromClassName(props.className);
        }
      }
    });
    return foundLanguage;
  }, [children]);

  // Get display label for language
  const getDisplayLanguage = (lang: string | null): string | null => {
    if (!lang) return null;
    return LANGUAGE_LABELS[lang] || lang.toUpperCase();
  };

  const displayLanguage = getDisplayLanguage(language);

  const handleCopy = useCallback(() => {
    const codeContent = extractTextContent(children);
    navigator.clipboard.writeText(codeContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="code-block-wrapper">
      {/* Header with language label and copy button */}
      <div className="code-block-header">
        {displayLanguage && (
          <Tag type="gray" size="sm">
            {displayLanguage}
          </Tag>
        )}
        {enableCopy && (
          <IconButton
            kind="ghost"
            size="sm"
            label={copied ? "已複製" : "複製程式碼"}
            onClick={handleCopy}
            className={`code-copy-button ${copied ? "copied" : ""}`}
          >
            {copied ? <Checkmark size={16} /> : <Copy size={16} />}
          </IconButton>
        )}
      </div>
      <pre>{children}</pre>
    </div>
  );
};

/**
 * Unified Markdown renderer component with consistent plugins.
 *
 * Features:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Raw HTML support (aside, div, etc.)
 * - Math formulas with KaTeX (optional)
 * - Syntax highlighting (optional)
 * - Copy button for code blocks (optional)
 *
 * Supported languages for syntax highlighting:
 * - C, C++, Python, Java, JavaScript, TypeScript
 * - Bash/Shell, YAML, JSON, SQL, CSS, HTML/XML
 *
 * @example
 * // Basic usage
 * <MarkdownRenderer>{markdownContent}</MarkdownRenderer>
 *
 * // With math formulas
 * <MarkdownRenderer enableMath>{contentWithMath}</MarkdownRenderer>
 *
 * // With copy button
 * <MarkdownRenderer enableCopy>{contentWithCode}</MarkdownRenderer>
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  children,
  enableMath = false,
  enableHighlight = false,
  enableCopy = false,
  className = "",
  style,
}) => {
  // Build plugins based on options
  const remarkPlugins: any[] = [remarkGfm];
  const rehypePlugins: any[] = [rehypeRaw, rehypeSlug];

  if (enableMath) {
    remarkPlugins.push(remarkMath);
    rehypePlugins.push(rehypeKatex);
  }

  if (enableHighlight) {
    // Use registered hljs languages
    rehypePlugins.push([
      rehypeHighlight,
      {
        detect: true,
        ignoreMissing: true,
      },
    ]);
  }

  // Custom components for rendering
  const components:
    | Record<string, React.ComponentType<{ children?: React.ReactNode }>>
    | undefined = enableCopy
    ? {
        pre: ({ children }: { children?: React.ReactNode }) => (
          <CodeBlock enableCopy={enableCopy}>{children}</CodeBlock>
        ),
      }
    : undefined;

  return (
    <div className={`markdown-body ${className}`.trim()} style={style}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
