type Classroom = {
  classroom_id?: string | null;
  name?: string | null;
  description?: string | null;
  current_user_role?: string | null;
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

  .qjudge-widget {
    min-height: 100vh;
    padding: 20px;
    background: #ffffff;
  }

  .qjudge-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .qjudge-title {
    margin: 0;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 700;
    letter-spacing: 0;
    color: #111827;
  }

  .qjudge-subtitle {
    margin: 6px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: #6b7280;
  }

  .qjudge-count {
    flex: 0 0 auto;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 650;
    color: #374151;
    background: #f9fafb;
  }

  .qjudge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .qjudge-card {
    min-width: 0;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px;
    background: #f9fafb;
  }

  .qjudge-card-title {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 16px;
    line-height: 1.35;
    font-weight: 700;
    color: #0f62fe;
  }

  .qjudge-card-description {
    margin: 8px 0 0;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.45;
    color: #4b5563;
  }

  .qjudge-role {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    margin-top: 12px;
    border-radius: 999px;
    padding: 4px 8px;
    background: #e0ecff;
    color: #0f3a8a;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  .qjudge-empty,
  .qjudge-loading {
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
    :root {
      color: #f9fafb;
    }

    .qjudge-widget {
      background: #111827;
    }

    .qjudge-title {
      color: #f9fafb;
    }

    .qjudge-subtitle,
    .qjudge-empty,
    .qjudge-loading {
      color: #9ca3af;
    }

    .qjudge-count,
    .qjudge-card,
    .qjudge-empty,
    .qjudge-loading {
      border-color: #374151;
      background: #1f2937;
    }

    .qjudge-count {
      color: #d1d5db;
    }

    .qjudge-card-title {
      color: #78a9ff;
    }

    .qjudge-card-description {
      color: #d1d5db;
    }

    .qjudge-role {
      background: #1d4ed8;
      color: #dbeafe;
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

function getClassroomsFromPayload(payload: unknown): Classroom[] | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.classrooms,
    (record.structuredContent as Record<string, unknown> | undefined)?.classrooms,
    (record.result as Record<string, unknown> | undefined)?.classrooms,
    ((record.result as Record<string, unknown> | undefined)?.structuredContent as Record<string, unknown> | undefined)?.classrooms,
    (record.params as Record<string, unknown> | undefined)?.classrooms,
    ((record.params as Record<string, unknown> | undefined)?.structuredContent as Record<string, unknown> | undefined)?.classrooms,
    (((record.params as Record<string, unknown> | undefined)?.result as Record<string, unknown> | undefined)?.structuredContent as Record<string, unknown> | undefined)?.classrooms,
  ];

  const classrooms = candidates.find(Array.isArray);
  return Array.isArray(classrooms) ? (classrooms as Classroom[]) : null;
}

function readInitialClassrooms(): Classroom[] | null {
  return (
    getClassroomsFromPayload(window.openai?.toolOutput) ??
    getClassroomsFromPayload(window.openai?.toolResponseMetadata)
  );
}

function render(classrooms: Classroom[] | null): void {
  if (!root) return;

  if (!classrooms) {
    root.innerHTML = `
      <main class="qjudge-widget">
        <div class="qjudge-loading">正在載入 QJudge classrooms...</div>
      </main>
    `;
    return;
  }

  if (classrooms.length === 0) {
    root.innerHTML = `
      <main class="qjudge-widget">
        <section class="qjudge-empty">沒有找到可管理的 classroom。</section>
      </main>
    `;
    return;
  }

  const cards = classrooms
    .map((classroom) => {
      const name = escapeHtml(classroom.name || "未命名 classroom");
      const description = classroom.description
        ? `<p class="qjudge-card-description">${escapeHtml(classroom.description)}</p>`
        : "";
      const role = escapeHtml(classroom.current_user_role || "unknown");

      return `
        <article class="qjudge-card">
          <h3 class="qjudge-card-title">${name}</h3>
          ${description}
          <span class="qjudge-role">${role}</span>
        </article>
      `;
    })
    .join("");

  root.innerHTML = `
    <main class="qjudge-widget">
      <header class="qjudge-header">
        <div>
          <h2 class="qjudge-title">QJudge Classrooms</h2>
          <p class="qjudge-subtitle">你目前可管理的 classroom 清單。</p>
        </div>
        <span class="qjudge-count">${classrooms.length} 個</span>
      </header>
      <section class="qjudge-grid">${cards}</section>
    </main>
  `;
}

render(readInitialClassrooms());

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const classrooms = getClassroomsFromPayload(event.data);
  if (classrooms) render(classrooms);
});

let attempts = 0;
const pollOpenAiState = window.setInterval(() => {
  attempts += 1;
  const classrooms = readInitialClassrooms();
  if (classrooms || attempts > 20) {
    window.clearInterval(pollOpenAiState);
  }
  if (classrooms) render(classrooms);
}, 100);
