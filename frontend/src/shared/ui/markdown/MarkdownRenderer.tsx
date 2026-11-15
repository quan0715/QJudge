import {
  memo,
  useEffect,
  useId,
  useState,
  useMemo,
  isValidElement,
  Children,
} from "react";
import ReactMarkdown from "react-markdown";
import type { Options as ReactMarkdownOptions } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import {
  CodeSnippet,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@carbon/react";

// Import highlight.js languages (wired directly into rehype-highlight via HIGHLIGHT_LANGUAGES)
import type { LanguageFn } from "highlight.js";
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
import ini from "highlight.js/lib/languages/ini";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import diff from "highlight.js/lib/languages/diff";

// Extend highlight.js bash grammar with CLI tools, subcommands, flags, env assignments, and URLs
const enhancedBash: LanguageFn = (hljs) => {
  const lang = bash(hljs);
  lang.contains.push(
    {
      className: "string",
      begin: /https?:\/\/[^\s"'`\\]+/,
      relevance: 0,
    },
    {
      className: "attr",
      begin: /\b[A-Z_][A-Z0-9_]*(?==)/,
      relevance: 0,
    },
    {
      className: "params",
      begin: /(?:^|\s)--?[a-zA-Z0-9][\w-]*/,
      relevance: 0,
    },
    {
      className: "keyword",
      begin:
        /\b(?:git|docker|compose|npm|npx|pnpm|yarn|node|python3?|pip3?|pytest|uv|uvicorn|celery|alembic|curl|wget|ssh|scp|sudo|apt(?:-get)?|systemctl|journalctl|nginx|certbot|ufw|chmod|chown|mkdir|rm|cp|mv|ls|cat|grep|rg|sed|awk|tar|openssl|wrangler)\b|(?:\.\/)?deploy\/qjudge\b/,
      relevance: 0,
    },
    {
      className: "title",
      begin:
        /\b(?:init|up|down|start|stop|restart|status|logs|ps|exec|build|pull|push|clone|checkout|branch|merge|commit|install|uninstall|run|test|check|upgrade|rollback|addon|ingress|storage|media|create|deploy)\b/,
      relevance: 0,
    },
  );
  return lang;
};

const HIGHLIGHT_LANGUAGES: Record<string, LanguageFn> = {
  cpp,
  c,
  python,
  java,
  javascript,
  typescript,
  bash: enhancedBash,
  yaml,
  json,
  sql,
  css: cssLang,
  xml,
  ini,
  dockerfile,
  diff,
};

const HIGHLIGHT_ALIASES: Record<string, string[]> = {
  python: ["py"],
  javascript: ["js", "jsx"],
  typescript: ["ts", "tsx"],
  bash: ["sh", "shell", "zsh"],
  yaml: ["yml"],
  xml: ["html"],
  ini: ["env", "dotenv", "properties", "toml"],
  dockerfile: ["docker"],
};

const PLAIN_TEXT_LANGUAGES = ["text", "txt", "plaintext", "csv", "mermaid"];

import { normalizeMarkdownText } from "@/shared/utils/markdownText";

import "katex/dist/katex.min.css";
import "@/styles/markdown.scss";

interface MarkdownRendererProps {
  children: string;
  /** Include math rendering (KaTeX) */
  enableMath?: boolean;
  /** Include syntax highlighting for code blocks */
  enableHighlight?: boolean;
  /** Enable copy button for code blocks */
  enableCopy?: boolean;
  /** Render ```mermaid code fences as diagrams (enable only for trusted docs) */
  enableMermaid?: boolean;
  /** Allow raw HTML in markdown (unsafe for untrusted content) */
  allowRawHtml?: boolean;
  /** Additional className for styling */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

// Extract language from code element className
const getLanguageFromClassName = (className?: string): string | null => {
  if (!className) return null;
  const match = className.match(/language-([\w-]+)/);
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

type MermaidApi = (typeof import("mermaid"))["default"];

let mermaidLoader: Promise<MermaidApi> | null = null;

const loadMermaid = () => {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then((module) => {
      const mermaidApi = module.default;
      mermaidApi.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
      });
      return mermaidApi;
    });
  }

  return mermaidLoader;
};

const MermaidBlock: React.FC<{ chart: string }> = ({ chart }) => {
  const reactId = useId();
  const diagramId = useMemo(
    () => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const [renderResult, setRenderResult] = useState<{
    chart: string;
    svg: string;
    hasError: boolean;
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    loadMermaid()
      .then((mermaidApi) => mermaidApi.render(diagramId, chart))
      .then(({ svg: renderedSvg }) => {
        if (isActive) {
          setRenderResult({ chart, svg: renderedSvg, hasError: false });
        }
      })
      .catch(() => {
        if (isActive) {
          setRenderResult({ chart, svg: "", hasError: true });
        }
      });

    return () => {
      isActive = false;
    };
  }, [chart, diagramId]);

  const isCurrentResult = renderResult?.chart === chart;

  if (isCurrentResult && renderResult.hasError) {
    return (
      <div className="mermaid-block mermaid-block--error">
        <p>Mermaid 圖表語法無法渲染，以下顯示原始碼。</p>
        <pre>
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  if (!isCurrentResult || !renderResult.svg) {
    return (
      <div
        className="mermaid-block mermaid-block--loading"
        aria-label="Mermaid 圖表載入中"
      />
    );
  }

  return (
    <div
      className="mermaid-block"
      data-testid="mermaid-diagram"
      aria-label="Mermaid 圖表"
      role="img"
      dangerouslySetInnerHTML={{ __html: renderResult.svg }}
    />
  );
};

// Trim trailing newline added by markdown fenced code blocks so Carbon CodeSnippet
// does not render an extra blank line.
const trimTrailingNewline = (node: React.ReactNode): React.ReactNode => {
  if (typeof node === "string") {
    return node.replace(/\n$/, "");
  }
  if (Array.isArray(node) && node.length > 0) {
    const next = [...node];
    next[next.length - 1] = trimTrailingNewline(next[next.length - 1]);
    return next;
  }
  return node;
};

// Code block rendered with Carbon CodeSnippet (or Mermaid diagram when enabled)
const CodeBlock: React.FC<{
  children: React.ReactNode;
  enableCopy: boolean;
  enableMermaid: boolean;
}> = ({ children, enableCopy, enableMermaid }) => {
  const { language, codeChildren } = useMemo(() => {
    let foundLanguage: string | null = null;
    let innerChildren: React.ReactNode = children;
    Children.forEach(children, (child) => {
      if (isValidElement(child)) {
        const props = child.props as {
          className?: string;
          children?: React.ReactNode;
        };
        if (props.className) {
          foundLanguage = getLanguageFromClassName(props.className);
        }
        if (props.children !== undefined) {
          innerChildren = props.children;
        }
      }
    });
    return {
      language: foundLanguage,
      codeChildren: trimTrailingNewline(innerChildren),
    };
  }, [children]);

  const trimmedCode = useMemo(
    () => extractTextContent(children).replace(/\n$/, ""),
    [children],
  );

  if (enableMermaid && language === "mermaid") {
    return <MermaidBlock chart={trimmedCode.trim()} />;
  }

  const isMultiLine = trimmedCode.includes("\n");

  return (
    <CodeSnippet
      type={isMultiLine ? "multi" : "single"}
      className="code-block-wrapper"
      data-language={language || undefined}
      copyText={trimmedCode}
      hideCopyButton={!enableCopy}
      feedback="已複製"
      copyButtonDescription="複製程式碼"
      showMoreText="展開更多"
      showLessText="收合"
      minCollapsedNumberOfRows={1}
    >
      {codeChildren}
    </CodeSnippet>
  );
};

/**
 * Unified Markdown renderer component with consistent plugins.
 *
 * Features:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Raw HTML support (aside, div, etc.) (optional)
 * - Math formulas with KaTeX (optional)
 * - Syntax highlighting (optional)
 * - Copy button for code blocks (optional)
 * - Mermaid diagrams for trusted docs (optional)
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
// Static base components — defined once at module scope so references stay
// stable across renders and never invalidate react-markdown's internal memo.
const BASE_COMPONENTS: Record<
  string,
  React.ComponentType<{ children?: React.ReactNode }>
> = {
  table: ({ children }) => (
    <Table size="md" aria-label="資料表格" className="markdown-table">
      {children}
    </Table>
  ),
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => <TableHeader>{children}</TableHeader>,
  td: ({ children }) => <TableCell>{children}</TableCell>,
};

const MarkdownRendererComponent: React.FC<MarkdownRendererProps> = ({
  children,
  enableMath = false,
  enableHighlight = false,
  enableCopy = false,
  enableMermaid = false,
  allowRawHtml = false,
  className = "",
  style,
}) => {
  // Memoize plugin arrays so ReactMarkdown receives stable references across
  // renders (critical when the parent re-renders frequently, e.g. on SSE
  // deltas). Without this, rehypeHighlight/rehypeKatex would be re-run on
  // identical content.
  const remarkPlugins = useMemo(() => {
    const plugins: NonNullable<ReactMarkdownOptions["remarkPlugins"]> = [
      remarkGfm,
    ];
    if (enableMath) plugins.push(remarkMath);
    return plugins;
  }, [enableMath]);

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<ReactMarkdownOptions["rehypePlugins"]> = [];
    if (allowRawHtml) plugins.push(rehypeRaw);
    plugins.push(rehypeSlug);
    if (enableMath) plugins.push(rehypeKatex);
    if (enableHighlight) {
      plugins.push([
        rehypeHighlight,
        {
          languages: HIGHLIGHT_LANGUAGES,
          aliases: HIGHLIGHT_ALIASES,
          plainText: PLAIN_TEXT_LANGUAGES,
          detect: true,
          ignoreMissing: true,
        },
      ]);
    }
    return plugins;
  }, [allowRawHtml, enableMath, enableHighlight]);

  const components = useMemo(() => {
    const PreBlock: React.ComponentType<{ children?: React.ReactNode }> = ({
      children: preChildren,
    }) => (
      <CodeBlock enableCopy={enableCopy} enableMermaid={enableMermaid}>
        {preChildren}
      </CodeBlock>
    );

    return { ...BASE_COMPONENTS, pre: PreBlock };
  }, [enableCopy, enableMermaid]);

  const normalizedChildren = normalizeMarkdownText(children);

  return (
    <div className={`markdown-body ${className}`.trim()} style={style}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalizedChildren}
      </ReactMarkdown>
    </div>
  );
};

// Memoize the whole renderer: identical children + flags should not re-parse
// and re-highlight. This is the single biggest win for chat message lists
// where completed bubbles re-render as new deltas arrive for later messages.
const MarkdownRenderer = memo(MarkdownRendererComponent);

export default MarkdownRenderer;
