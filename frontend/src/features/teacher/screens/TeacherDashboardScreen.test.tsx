import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    user: { username: "teacher1", role: "teacher" },
    loading: false,
  }),
}));

vi.mock("./TeacherProblemsScreen", () => ({
  default: () => <div data-testid="teacher-problems" />,
}));

vi.mock("./TeacherContestsScreen", () => ({
  default: () => <div data-testid="teacher-contests" />,
}));

vi.mock("@/features/chatbot", () => ({
  ChatbotWidget: (props: any) => (
    <button data-testid="chatbot-widget" aria-label="chatbot">
      Chatbot
    </button>
  ),
}));

import TeacherDashboardScreen from "./TeacherDashboardScreen";

describe("TeacherDashboardScreen", () => {
  it("renders chatbot button on teacher dashboard", () => {
    render(<TeacherDashboardScreen />);
    expect(screen.getByTestId("chatbot-widget")).toBeInTheDocument();
  });

  it("renders the dashboard title", () => {
    render(<TeacherDashboardScreen />);
    expect(screen.getByText("教師後台")).toBeInTheDocument();
  });
});
