import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ParticipantDashboard } from "@/core/entities/contest.entity";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

import ParticipantStatusCards from "./ParticipantStatusCards";

const dashboard = {
  contestType: "paper_exam",
  participant: { userId: "7", username: "s7", examStatus: "in_progress", violationCount: 0 },
  overview: { totalScore: 10, maxScore: 100 },
} as unknown as ParticipantDashboard;

describe("ParticipantStatusCards", () => {
  it("renders live and exam status cards like the drawer", () => {
    render(<ParticipantStatusCards dashboard={dashboard} showViolations />);
    expect(screen.getByRole("heading", { name: "即時狀態" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "考試狀態" })).toBeInTheDocument();
    expect(screen.getByText("考試連線")).toBeInTheDocument();
    expect(screen.getByText("Webcam")).toBeInTheDocument();
    expect(screen.getByText("10.00 / 100.00 分")).toBeInTheDocument();
    expect(screen.getByText("違規次數")).toBeInTheDocument();
  });
});
