type DiffChange = {
  field: string;
  label: string;
  old_value: unknown;
  new_value: unknown;
};

type ExamQuestionDiff = {
  kind?: string;
  question_id?: string | null;
  changes?: DiffChange[];
  has_changes?: boolean;
  summary?: {
    changed?: number;
    unchanged?: number;
  };
  risk_flags?: string[];
};

declare global {
  interface Window {
    openai?: {
      toolOutput?: unknown;
      toolResponseMetadata?: unknown;
      theme?: string;
    };
  }
}

const root = document.getElementById("root");

const styles = document.createElement("style");
styles.textContent = `
  :root {
    color-scheme: light dark;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: transparent;
    color: #111827;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: transparent;
  }

  .diff-widget {
    min-height: 100vh;
    padding: 20px;
    background: #ffffff;
  }

  .diff-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .diff-title {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: 0;
  }

  .diff-subtitle {
    margin: 6px 0 0;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .diff-count {
    flex: 0 0 auto;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    padding: 6px 10px;
    background: #f9fafb;
    color: #374151;
    font-size: 13px;
    font-weight: 650;
  }

  .diff-risks {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
  }

  .diff-risk {
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 10px 12px;
    background: #fffbeb;
    color: #92400e;
    font-size: 13px;
    line-height: 1.45;
  }

  .diff-list {
    display: grid;
    gap: 12px;
  }

  .diff-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  }

  .diff-card-title {
    margin: 0;
    padding: 10px 12px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 700;
  }

  .diff-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .diff-column {
    min-width: 0;
    padding: 12px;
  }

  .diff-column + .diff-column {
    border-left: 1px solid #e5e7eb;
  }

  .diff-label {
    display: block;
    margin-bottom: 6px;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
  }

  .diff-value {
    min-height: 58px;
    margin: 0;
    border-radius: 6px;
    padding: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .diff-old {
    background: #fef2f2;
    color: #7f1d1d;
  }

  .diff-new {
    background: #ecfdf5;
    color: #064e3b;
  }

  .diff-empty,
  .diff-loading {
    min-height: 180px;
    display: grid;
    place-items: center;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    padding: 24px;
    text-align: center;
    color: #6b7280;
    background: #f9fafb;
    font-size: 14px;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .diff-columns {
      grid-template-columns: 1fr;
    }

    .diff-column + .diff-column {
      border-left: 0;
      border-top: 1px solid #e5e7eb;
    }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      color: #f9fafb;
    }

    .diff-widget {
      background: #111827;
    }

    .diff-subtitle,
    .diff-label,
    .diff-empty,
    .diff-loading {
      color: #9ca3af;
    }

    .diff-count,
    .diff-card-title,
    .diff-empty,
    .diff-loading {
      border-color: #374151;
      background: #1f2937;
      color: #d1d5db;
    }

    .diff-card,
    .diff-column + .diff-column {
      border-color: #374151;
      background: #111827;
    }

    .diff-risk {
      border-color: #b45309;
      background: #451a03;
      color: #fcd34d;
    }

    .diff-old {
      background: #450a0a;
      color: #fecaca;
    }

    .diff-new {
      background: #052e1a;
      color: #bbf7d0;
    }
  }
`;
document.head.appendChild(styles);

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "空值";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function getDiffFromPayload(payload: unknown): ExamQuestionDiff | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const candidates = [
    record,
    record.structuredContent,
    record.result,
    (record.result as Record<string, unknown> | undefined)?.structuredContent,
    record.params,
    (record.params as Record<string, unknown> | undefined)?.structuredContent,
    ((record.params as Record<string, unknown> | undefined)?.result as Record<string, unknown> | undefined)?.structuredContent,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const diff = candidate as ExamQuestionDiff;
    if (diff.kind === "exam_question_diff" || Array.isArray(diff.changes)) {
      return diff;
    }
  }
  return null;
}

function readInitialDiff(): ExamQuestionDiff | null {
  return (
    getDiffFromPayload(window.openai?.toolOutput) ??
    getDiffFromPayload(window.openai?.toolResponseMetadata)
  );
}

function render(diff: ExamQuestionDiff | null): void {
  if (!root) return;

  if (!diff) {
    root.innerHTML = `
      <main class="diff-widget">
        <div class="diff-loading">正在載入題目差異...</div>
      </main>
    `;
    return;
  }

  const changes = diff.changes ?? [];
  const changedCount = diff.summary?.changed ?? changes.length;

  if (!diff.has_changes || changes.length === 0) {
    root.innerHTML = `
      <main class="diff-widget">
        <header class="diff-header">
          <div>
            <h2 class="diff-title">Exam Question Diff</h2>
            <p class="diff-subtitle">Question ${escapeHtml(diff.question_id ?? "")}</p>
          </div>
          <span class="diff-count">0 個變更</span>
        </header>
        <section class="diff-empty">沒有偵測到欄位變更。</section>
      </main>
    `;
    return;
  }

  const risks = (diff.risk_flags ?? [])
    .map((risk) => `<div class="diff-risk">${escapeHtml(risk)}</div>`)
    .join("");

  const cards = changes
    .map((change) => `
      <article class="diff-card">
        <h3 class="diff-card-title">${escapeHtml(change.label || change.field)}</h3>
        <div class="diff-columns">
          <section class="diff-column">
            <span class="diff-label">目前版本</span>
            <pre class="diff-value diff-old">${escapeHtml(formatValue(change.old_value))}</pre>
          </section>
          <section class="diff-column">
            <span class="diff-label">準備更新</span>
            <pre class="diff-value diff-new">${escapeHtml(formatValue(change.new_value))}</pre>
          </section>
        </div>
      </article>
    `)
    .join("");

  root.innerHTML = `
    <main class="diff-widget">
      <header class="diff-header">
        <div>
          <h2 class="diff-title">Exam Question Diff</h2>
          <p class="diff-subtitle">Question ${escapeHtml(diff.question_id ?? "")}</p>
        </div>
        <span class="diff-count">${changedCount} 個變更</span>
      </header>
      ${risks ? `<section class="diff-risks">${risks}</section>` : ""}
      <section class="diff-list">${cards}</section>
    </main>
  `;
}

render(readInitialDiff());

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const diff = getDiffFromPayload(event.data);
  if (diff) render(diff);
});

let attempts = 0;
const pollOpenAiState = window.setInterval(() => {
  attempts += 1;
  const diff = readInitialDiff();
  if (diff || attempts > 20) {
    window.clearInterval(pollOpenAiState);
  }
  if (diff) render(diff);
}, 100);
