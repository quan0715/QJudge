import type { ReactNode } from "react";

export type ExamWorkspaceIconName =
  | "back"
  | "sidebar"
  | "overview"
  | "questions"
  | "announcements"
  | "review"
  | "standings"
  | "chevronRight"
  | "chevronLeft"
  | "arrowRight"
  | "refresh"
  | "empty";

// One stroke weight keeps every workspace control visually quiet.
const PATHS: Record<ExamWorkspaceIconName, ReactNode> = {
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></>,
  overview: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.5h.01" /></>,
  questions: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  announcements: <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 7-2.5 8.5h17c0-1.5-2.5-2-2.5-8.5M10 20.5h4" />,
  review: <><rect x="4.5" y="3.5" width="15" height="17" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  standings: <path d="M8 3.5h8V9a4 4 0 0 1-8 0V3.5ZM8 5.5H4.5V8A3.5 3.5 0 0 0 8 11.5m8-6h3.5V8a3.5 3.5 0 0 1-3.5 3.5M12 13v6.5m-4 1h8" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  empty: <><rect x="4.5" y="4.5" width="15" height="15" rx="3" /><path d="M8.5 10.5h7M8.5 14h4.5" /></>,
};

export function ExamWorkspaceIcon({ name, size = 18 }: { name: ExamWorkspaceIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
