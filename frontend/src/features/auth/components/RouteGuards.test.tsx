import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getClassroom } from "@/infrastructure/api/repositories/classroom.repository";
import { RequireClassroomManager } from "./RouteGuards";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 7, username: "ta", role: "student" },
    loading: false,
  }),
}));

vi.mock("@/infrastructure/api/repositories/classroom.repository", () => ({
  getClassroom: vi.fn(),
}));

describe("RequireClassroomManager", () => {
  beforeEach(() => {
    vi.mocked(getClassroom).mockReset();
  });

  it("allows a classroom TA even when their platform role is student", async () => {
    vi.mocked(getClassroom).mockResolvedValue({
      currentUserRole: "manager",
    } as Awaited<ReturnType<typeof getClassroom>>);

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin"]}>
        <Routes>
          <Route element={<RequireClassroomManager />}>
            <Route
              path="/classrooms/:classroomId/contest/:contestId/admin"
              element={<div>contest admin</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("contest admin")).toBeInTheDocument();
    expect(getClassroom).toHaveBeenCalledWith("classroom-1");
  });

  it("redirects an ordinary classroom member to the contest", async () => {
    vi.mocked(getClassroom).mockResolvedValue({
      currentUserRole: "member",
    } as Awaited<ReturnType<typeof getClassroom>>);

    render(
      <MemoryRouter initialEntries={["/classrooms/classroom-1/contest/contest-1/admin"]}>
        <Routes>
          <Route element={<RequireClassroomManager />}>
            <Route
              path="/classrooms/:classroomId/contest/:contestId/admin"
              element={<div>contest admin</div>}
            />
          </Route>
          <Route
            path="/classrooms/:classroomId/contest/:contestId"
            element={<div>contest dashboard</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("contest dashboard")).toBeInTheDocument();
    expect(screen.queryByText("contest admin")).not.toBeInTheDocument();
  });
});
