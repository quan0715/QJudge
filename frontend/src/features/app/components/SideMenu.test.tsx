import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { SideMenu } from "./SideMenu";

const mockGetClassrooms = vi.fn();
const mockGetQuestionBanks = vi.fn();
const mockGetContest = vi.fn();
const mockCopilotSessions = vi.hoisted(() => ({
  sessions: [] as Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
  activeSession: {
    status: "empty" as "empty" | "ready",
    id: null as string | null,
    data: null,
    error: null,
  },
  listStatus: "ready",
  error: null,
  create: vi.fn(),
  select: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  clearError: vi.fn(),
}));

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

vi.mock("@copilot", () => ({
  useCopilotSessions: () => mockCopilotSessions,
}));

vi.mock("@/features/chatbot/components/chat-ui/ChatHistoryPanel", () => ({
  ChatHistoryPanel: (props: {
    sessions: Array<{ id: string; title: string }>;
    onSelectSession(id: string): void;
    onDeleteSession(id: string): void;
    onRenameSession(id: string, title: string): void;
    onNewTask?(): void;
  }) => (
    <div>
      {props.sessions.map((session) => (
        <div key={session.id}>
          <button type="button" onClick={() => props.onSelectSession(session.id)}>
            {session.title}
          </button>
          <button
            type="button"
            aria-label={`rename ${session.id}`}
            onClick={() => props.onRenameSession(session.id, "Renamed")}
          />
          <button
            type="button"
            aria-label={`delete ${session.id}`}
            onClick={() => props.onDeleteSession(session.id)}
          />
        </div>
      ))}
      <button type="button" onClick={props.onNewTask}>ui.newTask</button>
    </div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function ChatRouteProbe() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/dashboard")}>Leave chat</button>
      <LocationProbe />
    </>
  );
}

describe("SideMenu contest admin workspace panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopilotSessions.sessions = [];
    mockCopilotSessions.activeSession = {
      status: "empty",
      id: null,
      data: null,
      error: null,
    };
    mockCopilotSessions.create.mockResolvedValue(null);
    mockCopilotSessions.select.mockResolvedValue(undefined);
    mockCopilotSessions.rename.mockResolvedValue({ ok: true });
    mockCopilotSessions.remove.mockResolvedValue({
      ok: true,
      activeSessionId: null,
    });
    mockCopilotSessions.refresh.mockResolvedValue(undefined);
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

  it("shows published panel set including grading", async () => {
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
    expect(screen.getByText("adminLayout.nav.proctoring")).toBeInTheDocument();
    expect(screen.getByText("adminLayout.nav.examGrading")).toBeInTheDocument();
    expect(
      screen.queryByText("adminLayout.nav.examStatistics"),
    ).not.toBeInTheDocument();
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

  it("creates a Copilot session and navigates with the explicit QJudge query", async () => {
    mockCopilotSessions.create.mockResolvedValue("session-new");

    render(
      <MemoryRouter initialEntries={["/chat"]}>
        <SideMenu variant="panel" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText("ui.newTask"));

    await waitFor(() => expect(mockCopilotSessions.create).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("location-search")).toHaveTextContent(
        "?ai_session_id=session-new",
      ),
    );
  });

  it("selects, renames and removes sessions only through the Copilot hook", async () => {
    const now = new Date();
    mockCopilotSessions.sessions = [
      { id: "session-1", title: "Current", createdAt: now, updatedAt: now },
      { id: "session-2", title: "Other", createdAt: now, updatedAt: now },
    ];
    mockCopilotSessions.activeSession = {
      status: "ready",
      id: "session-1",
      data: null,
      error: null,
    };
    mockCopilotSessions.remove.mockResolvedValue({
      ok: true,
      activeSessionId: "session-2",
    });

    render(
      <MemoryRouter initialEntries={["/chat?ai_session_id=session-1"]}>
        <SideMenu variant="panel" />
        <ChatRouteProbe />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockCopilotSessions.refresh).toHaveBeenCalled());
    mockCopilotSessions.refresh.mockClear();

    fireEvent.click(await screen.findByText("Other"));
    await waitFor(() => expect(mockCopilotSessions.select).toHaveBeenCalledWith("session-2"));
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?ai_session_id=session-2",
    );

    fireEvent.click(screen.getByRole("button", { name: "rename session-1" }));
    await waitFor(() =>
      expect(mockCopilotSessions.rename).toHaveBeenCalledWith("session-1", "Renamed"),
    );

    fireEvent.click(screen.getByRole("button", { name: "delete session-1" }));
    await waitFor(() => expect(mockCopilotSessions.remove).toHaveBeenCalledWith("session-1"));
    expect(mockCopilotSessions.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?ai_session_id=session-2",
    );
  });

  it("preserves navigation and skips refresh when session mutations fail", async () => {
    const now = new Date();
    mockCopilotSessions.sessions = [
      { id: "session-1", title: "Current", createdAt: now, updatedAt: now },
    ];
    mockCopilotSessions.activeSession = {
      status: "ready",
      id: "session-1",
      data: null,
      error: null,
    };
    mockCopilotSessions.rename.mockResolvedValue({
      ok: false,
      error: { operation: "update-session" },
    });
    mockCopilotSessions.remove.mockResolvedValue({
      ok: false,
      activeSessionId: "session-1",
      error: { operation: "update-session" },
    });

    render(
      <MemoryRouter initialEntries={["/chat?ai_session_id=session-1"]}>
        <SideMenu variant="panel" />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockCopilotSessions.refresh).toHaveBeenCalled());
    mockCopilotSessions.refresh.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "rename session-1" }));
    await waitFor(() => expect(mockCopilotSessions.rename).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "delete session-1" }));
    await waitFor(() => expect(mockCopilotSessions.remove).toHaveBeenCalled());

    expect(mockCopilotSessions.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?ai_session_id=session-1",
    );
  });

  it("navigates to the replacement returned after deleting the active session", async () => {
    const now = new Date();
    mockCopilotSessions.sessions = [
      { id: "session-1", title: "Current", createdAt: now, updatedAt: now },
    ];
    mockCopilotSessions.activeSession = {
      status: "ready",
      id: "session-1",
      data: null,
      error: null,
    };
    mockCopilotSessions.remove.mockResolvedValue({
      ok: true,
      activeSessionId: "session-replacement",
    });

    render(
      <MemoryRouter initialEntries={["/chat?ai_session_id=session-1"]}>
        <SideMenu variant="panel" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "delete session-1" }));
    await waitFor(() => expect(mockCopilotSessions.remove).toHaveBeenCalledWith("session-1"));

    expect(screen.getByTestId("location-search")).toHaveTextContent(
      "?ai_session_id=session-replacement",
    );
  });
});
