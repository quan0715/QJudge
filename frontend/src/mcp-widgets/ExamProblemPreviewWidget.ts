type ExamProblem = {
  question_type?: string | null;
  prompt?: string | null;
  explanation?: string | null;
  score?: number | null;
  options?: string[] | null;
  correct_answer?: unknown;
};

type ExamProblemPreview = {
  kind?: string;
  question_id?: string | null;
  preview_problem?: ExamProblem;
  update_summary?: {
    changed_fields?: string[];
    changed_labels?: Record<string, string>;
    changed_count?: number;
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

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: transparent;
  }

  .preview-widget {
    min-height: 100vh;
    padding: 20px;
    background: #ffffff;
  }

  .preview-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }

  .preview-title {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 750;
    letter-spacing: 0;
  }

  .preview-subtitle {
    margin: 6px 0 0;
    color: #6b7280;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .preview-score {
    flex: 0 0 auto;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    padding: 6px 10px;
    background: #f9fafb;
    color: #374151;
    font-size: 13px;
    font-weight: 700;
  }

  .preview-alerts {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
  }

  .preview-alert {
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 10px 12px;
    background: #fffbeb;
    color: #92400e;
    font-size: 13px;
    line-height: 1.45;
  }

  .preview-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  }

  .preview-body {
    padding: 16px;
  }

  .preview-type {
    display: inline-flex;
    margin-bottom: 12px;
    border-radius: 999px;
    padding: 4px 8px;
    background: #e0ecff;
    color: #0f3a8a;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
  }

  .preview-prompt {
    margin: 0 0 16px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 16px;
    line-height: 1.65;
    color: #111827;
  }

  .preview-options {
    display: grid;
    gap: 8px;
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
  }

  .preview-option {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 8px;
    align-items: flex-start;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px;
    background: #f9fafb;
  }

  .preview-option--answer {
    border-color: #10b981;
    background: #ecfdf5;
  }

  .preview-option-index {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: #e5e7eb;
    color: #374151;
    font-size: 12px;
    font-weight: 750;
  }

  .preview-option-text {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.5;
  }

  .preview-explanation {
    border-top: 1px solid #e5e7eb;
    padding: 14px 16px;
    background: #f9fafb;
  }

  .preview-explanation-title {
    margin: 0 0 6px;
    color: #374151;
    font-size: 13px;
    font-weight: 750;
  }

  .preview-explanation-text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: #4b5563;
    font-size: 13px;
    line-height: 1.55;
  }

  .preview-changes {
    margin-top: 14px;
    color: #6b7280;
    font-size: 12px;
    line-height: 1.5;
  }

  .preview-empty,
  .preview-loading {
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

  @media (prefers-color-scheme: dark) {
    :root { color: #f9fafb; }

    .preview-widget { background: #111827; }
    .preview-subtitle,
    .preview-changes,
    .preview-empty,
    .preview-loading { color: #9ca3af; }

    .preview-score,
    .preview-card,
    .preview-option,
    .preview-empty,
    .preview-loading {
      border-color: #374151;
      background: #1f2937;
      color: #d1d5db;
    }

    .preview-prompt { color: #f9fafb; }

    .preview-type {
      background: #1d4ed8;
      color: #dbeafe;
    }

    .preview-option--answer {
      border-color: #34d399;
      background: #052e1a;
    }

    .preview-option-index {
      background: #374151;
      color: #e5e7eb;
    }

    .preview-explanation {
      border-color: #374151;
      background: #111827;
    }

    .preview-explanation-title { color: #e5e7eb; }
    .preview-explanation-text { color: #d1d5db; }

    .preview-alert {
      border-color: #b45309;
      background: #451a03;
      color: #fcd34d;
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

function getPreviewFromPayload(payload: unknown): ExamProblemPreview | null {
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
    const preview = candidate as ExamProblemPreview;
    if (preview.kind === "exam_problem_preview" || preview.preview_problem) {
      return preview;
    }
  }
  return null;
}

function readInitialPreview(): ExamProblemPreview | null {
  return (
    getPreviewFromPayload(window.openai?.toolOutput) ??
    getPreviewFromPayload(window.openai?.toolResponseMetadata)
  );
}

function isAnswerIndex(correctAnswer: unknown, index: number): boolean {
  if (Array.isArray(correctAnswer)) return correctAnswer.includes(index);
  return correctAnswer === index;
}

function renderOptions(problem: ExamProblem): string {
  const options = problem.options ?? [];
  if (!Array.isArray(options) || options.length === 0) return "";

  return `
    <ul class="preview-options">
      ${options.map((option, index) => {
        const label = String.fromCharCode(65 + index);
        const answerClass = isAnswerIndex(problem.correct_answer, index) ? " preview-option--answer" : "";
        return `
          <li class="preview-option${answerClass}">
            <span class="preview-option-index">${label}</span>
            <span class="preview-option-text">${escapeHtml(option)}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

function render(preview: ExamProblemPreview | null): void {
  if (!root) return;

  if (!preview) {
    root.innerHTML = `
      <main class="preview-widget">
        <div class="preview-loading">正在載入 exam problem 預覽...</div>
      </main>
    `;
    return;
  }

  const problem = preview.preview_problem;
  if (!problem) {
    root.innerHTML = `
      <main class="preview-widget">
        <section class="preview-empty">沒有可預覽的 exam problem。</section>
      </main>
    `;
    return;
  }

  const changedLabels = preview.update_summary?.changed_labels ?? {};
  const changedFields = preview.update_summary?.changed_fields ?? [];
  const changedText = changedFields
    .map((field) => changedLabels[field] || field)
    .join("、");
  const risks = (preview.risk_flags ?? [])
    .map((risk) => `<div class="preview-alert">${escapeHtml(risk)}</div>`)
    .join("");
  const explanation = problem.explanation
    ? `
      <section class="preview-explanation">
        <h3 class="preview-explanation-title">詳解 / 教師參考</h3>
        <p class="preview-explanation-text">${escapeHtml(problem.explanation)}</p>
      </section>
    `
    : "";

  root.innerHTML = `
    <main class="preview-widget">
      <header class="preview-header">
        <div>
          <h2 class="preview-title">Exam Problem Preview</h2>
          <p class="preview-subtitle">Question ${escapeHtml(preview.question_id ?? "")}</p>
        </div>
        <span class="preview-score">${escapeHtml(problem.score ?? "未設定")} 分</span>
      </header>
      ${risks ? `<section class="preview-alerts">${risks}</section>` : ""}
      <article class="preview-card">
        <section class="preview-body">
          <span class="preview-type">${escapeHtml(problem.question_type || "unknown")}</span>
          <p class="preview-prompt">${escapeHtml(problem.prompt || "未填寫題目敘述")}</p>
          ${renderOptions(problem)}
          ${changedText ? `<p class="preview-changes">本次預覽套用了：${escapeHtml(changedText)}</p>` : ""}
        </section>
        ${explanation}
      </article>
    </main>
  `;
}

render(readInitialPreview());

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const preview = getPreviewFromPayload(event.data);
  if (preview) render(preview);
});

let attempts = 0;
const pollOpenAiState = window.setInterval(() => {
  attempts += 1;
  const preview = readInitialPreview();
  if (preview || attempts > 20) {
    window.clearInterval(pollOpenAiState);
  }
  if (preview) render(preview);
}, 100);
