import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { SideMenu } from "./SideMenu";

const mockGetClassrooms = vi.fn();
const mockGetQuestionBanks = vi.fn();
const mockGetContest = vi.fn();

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock("@/features/auth/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "teacher" } }),
}));

vi.mock("@/infrastructure/api/repositories/classroom.repository", () => ({
  getClassrooms: (...args: unknown[]) => mockGetClassrooms(...args),
}));

vi.mock("@/infrastructure/api/repositories/questionBank.repository", () => ({
  getQuestionBanks: (...args: unknown[]) => mockGetQuestionBanks(...args),
}));

vi.mock("@/infrastructure/api/repositories/contest.repository", () => ({
  getContest: (...args: unknown[]) => mockGetContest(...args),
}));

vi.mock("@/features/chatbot/contexts/ChatSessionContext", () => ({
  useChatSessionContext: () => ({
    sessions: [],
    refreshSessions: vi.fn(),
  }),
}));

vi.mock("@/infrastructure/api/repositories", () => ({
  chatbotRepository: {
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

describe("SideMenu contest admin workspace panels", () => {
  beforeEach(() => {
    mockGetClassrooms.mockResolvedValue([
      {
        id: "classroom-1",
        name: "Classroom 1",
        icon: "education",
        currentUserRole: "owner",
      },
    ]);
    mockGetQuestionBanks.mockResolvedValue([]);
  });

  it("shows draft panel set and highlights active panel from query", async () => {
    mockGetContest.mockResolvedValue({
      id: "contest-1",
      contestType: "coding",
      status: "draft",
    });

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=problem_editor"]}>
        <SideMenu variant="panel" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("adminLayout.nav.overview")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.problemManagement")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.settings")).toBeInTheDocument();
    expect(screen.queryByText("adminLayout.nav.grading")).not.toBeInTheDocument();

    const editorButton = screen.getByText("adminLayout.nav.problemManagement").closest("button");
    expect(editorButton).toHaveClass("side-menu__link--active");
  });

  it("navigates contest settings entry through the panel query", async () => {
    mockGetContest.mockResolvedValue({
      id: "contest-1",
      contestType: "coding",
      status: "draft",
    });

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=overview"]}>
        <SideMenu variant="panel" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("adminLayout.nav.settings"));

    expect(screen.getByTestId("location-search")).toHaveTextContent("panel=settings");
  });

  it("shows published panel set including grading and statistics", async () => {
    mockGetContest.mockResolvedValue({
      id: "contest-2",
      contestType: "paper_exam",
      status: "published",
    });

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-2/admin?panel=overview"]}>
        <SideMenu variant="panel" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("adminLayout.nav.examManagement")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.examGrading")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.examStatistics")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.settings")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetContest).toHaveBeenCalledWith("contest-2");
    });
  });

  it("limits compact contest admin nav to page panels", async () => {
    mockGetContest.mockResolvedValue({
      id: "contest-1",
      contestType: "coding",
      status: "draft",
    });

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin?panel=overview"]}>
        <SideMenu variant="panel" compact />
      </MemoryRouter>,
    );

    expect(await screen.findByText("adminLayout.nav.overview")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.problemManagement")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.settings")).toBeInTheDocument();
    expect(screen.queryByText("nav.dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.classrooms")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
