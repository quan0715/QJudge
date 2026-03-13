import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContestParticipant } from "@/core/entities/contest.entity";
import ParticipantsListPane from "./ParticipantsListPane";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOptions?: string | Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      const template =
        typeof defaultValueOrOptions === "string" ? defaultValueOrOptions : key;
      const vars =
        (typeof defaultValueOrOptions === "object" ? defaultValueOrOptions : options) ?? {};
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
        const value = vars[name];
        return value === undefined || value === null ? `{{${name}}}` : String(value);
      });
    },
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
  it("shows bottom footer count and supports row selection", () => {
    const onSelect = vi.fn();
    render(
      <ParticipantsListPane
        participants={[participant]}
        totalItems={3}
        selectedUserId={participant.userId}
        loading={false}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("顯示 1 / 3 位")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Real Name"));
    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("does not render identity detail row", () => {
    render(
      <ParticipantsListPane
        participants={[participant]}
        totalItems={1}
        selectedUserId={participant.userId}
        loading={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("顯示名稱 Real Name")).not.toBeInTheDocument();
    expect(screen.queryByText("身份 student")).not.toBeInTheDocument();
    expect(screen.queryByText("註冊身份 SSO")).not.toBeInTheDocument();
  });

  it("falls back footer total to shown count when totalItems is missing", () => {
    render(
      <ParticipantsListPane
        participants={[participant]}
        selectedUserId={participant.userId}
        loading={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("顯示 1 / 1 位")).toBeInTheDocument();
  });
});
