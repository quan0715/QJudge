import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import ParticipantsListPane from "./ParticipantsListPane";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : key,
  }),
}));

const participant: ContestParticipant = {
  userId: "1",
  username: "student1",
  displayName: "Student One",
  userDisplayName: "Real Name",
  accountRole: "student",
  authProvider: "google",
  score: 90,
  joinedAt: "2026-03-11T08:00:00Z",
  examStatus: "in_progress",
  violationCount: 2,
};

describe("ParticipantsListPane", () => {
  it("calls refresh handler when refresh button is clicked", () => {
    const onRefreshParticipants = vi.fn();
    render(
      <ParticipantsListPane
        participants={[participant]}
        selectedUserId={participant.userId}
        loading={false}
        searchQuery=""
        statusFilter="all"
        statusOptions={[{ id: "all", label: "全部狀態" }]}
        sortKey="score_desc"
        sortOptions={[{ id: "score_desc", label: "分數高到低" }]}
        page={1}
        pageSize={20}
        totalItems={1}
        onSearchChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        onSelect={vi.fn()}
        onAddParticipant={vi.fn()}
        onRefreshParticipants={onRefreshParticipants}
      />,
    );

    fireEvent.click(screen.getByTestId("participants-list-refresh-btn"));
    expect(onRefreshParticipants).toHaveBeenCalledTimes(1);
  });

  it("does not render identity detail row", () => {
    render(
      <ParticipantsListPane
        participants={[participant]}
        selectedUserId={participant.userId}
        loading={false}
        searchQuery=""
        statusFilter="all"
        statusOptions={[{ id: "all", label: "全部狀態" }]}
        sortKey="score_desc"
        sortOptions={[{ id: "score_desc", label: "分數高到低" }]}
        page={1}
        pageSize={20}
        totalItems={1}
        onSearchChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onSortChange={vi.fn()}
        onPageChange={vi.fn()}
        onSelect={vi.fn()}
        onAddParticipant={vi.fn()}
        onRefreshParticipants={vi.fn()}
      />,
    );

    expect(screen.queryByText("顯示名稱 Real Name")).not.toBeInTheDocument();
    expect(screen.queryByText("身份 student")).not.toBeInTheDocument();
    expect(screen.queryByText("註冊身份 SSO")).not.toBeInTheDocument();
  });
});
