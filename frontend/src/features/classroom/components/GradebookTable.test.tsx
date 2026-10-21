import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClassroomGradebook } from "@/core/entities/classroom.entity";
import { GradebookTable } from "./GradebookTable";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallbackOrParams?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>,
    ) => {
      const fallback =
        typeof fallbackOrParams === "string" ? fallbackOrParams : key;
      const params =
        typeof fallbackOrParams === "string" ? maybeParams : fallbackOrParams;
      if (!params) return fallback;
      return Object.entries(params).reduce(
        (acc, [paramKey, value]) =>
          acc.replace(`{{${paramKey}}}`, String(value)),
        fallback,
      );
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: () => {},
  },
}));

const gradebook: ClassroomGradebook = {
  contests: [
    {
      id: "contest-lab",
      name: "Lab 1",
      contestType: "coding",
      startTime: "2026-09-15T02:00:00.000Z",
      maxScore: 300,
    },
    {
      id: "contest-midterm",
      name: "期中考",
      contestType: "paper_exam",
      startTime: null,
      maxScore: 120,
    },
  ],
  students: [
    {
      userId: 1,
      username: "110550001",
      displayName: "王小明",
      scores: { "contest-lab": 300, "contest-midterm": 96 },
    },
    {
      userId: 2,
      username: "110550002",
      displayName: "李小華",
      scores: { "contest-lab": 210, "contest-midterm": null },
    },
  ],
};

describe("GradebookTable", () => {
  it("renders only the contest name in contest headers", () => {
    render(
      <GradebookTable
        gradebook={gradebook}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Lab 1" })).toHaveTextContent(/^Lab 1$/);
    expect(screen.getByRole("columnheader", { name: "期中考" })).toHaveTextContent(/^期中考$/);
    expect(screen.queryByText("程式")).not.toBeInTheDocument();
    expect(screen.queryByText(/滿分/)).not.toBeInTheDocument();
  });

  it("shows each contest's average over attempted students in the last row", () => {
    render(
      <GradebookTable
        gradebook={{
          ...gradebook,
          contests: [
            ...gradebook.contests,
            { id: "contest-empty", name: "Lab 2", contestType: "coding", startTime: null, maxScore: 200 },
          ],
        }}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    const averageRow = screen.getByText("平均").closest("tr") as HTMLElement;
    const cells = within(averageRow).getAllByRole("cell");
    // Lab 1: (300 + 210) / 2; 期中考: only 96 attempted; Lab 2: nobody attempted.
    expect(cells.map((cell) => cell.textContent)).toEqual(["平均", "", "255.00", "96.00", "—"]);
  });

  it("renders the account and name columns with the student identity", () => {
    render(
      <GradebookTable
        gradebook={gradebook}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "帳號" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "姓名" }),
    ).toBeInTheDocument();
    expect(screen.getByText("110550001")).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("學生 2 人 · 考試 2 場")).toBeInTheDocument();
  });

  it("exposes the full username and name as titles on the identity cells", () => {
    const longUsername = "a-very-long-username-that-the-sticky-column-will-clip";
    const longName = "A Very Long Display Name That The Sticky Column Will Clip";
    render(
      <GradebookTable
        gradebook={{
          ...gradebook,
          students: [
            {
              userId: 7,
              username: longUsername,
              displayName: longName,
              scores: { "contest-lab": 1, "contest-midterm": null },
            },
            {
              userId: 8,
              username: "no-display-name",
              displayName: "",
              scores: { "contest-lab": 2, "contest-midterm": null },
            },
          ],
        }}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(screen.getByText(longUsername).closest("td")).toHaveAttribute(
      "title",
      longUsername,
    );
    expect(screen.getByText(longName).closest("td")).toHaveAttribute(
      "title",
      longName,
    );

    const plainRow = screen.getByText("no-display-name").closest("tr");
    expect(plainRow).not.toBeNull();
    const [usernameCell, nameCell] = Array.from(
      plainRow!.querySelectorAll("td"),
    );
    expect(usernameCell).toHaveAttribute("title", "no-display-name");
    expect(nameCell).not.toHaveAttribute("title");
  });

  it("renders raw scores and dash for absent", () => {
    render(
      <GradebookTable
        gradebook={gradebook}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    const firstRow = screen.getByText("110550001").closest("tr") as HTMLElement;
    const secondRow = screen.getByText("110550002").closest("tr") as HTMLElement;
    expect(within(firstRow).getByText("300.00")).toBeInTheDocument();
    expect(within(firstRow).getByText("96.00")).toBeInTheDocument();
    expect(within(secondRow).getByText("210.00")).toBeInTheDocument();
    expect(within(secondRow).getByLabelText("未參加")).toHaveTextContent("—");
  });

  it("calls onExport when export clicked", () => {
    const onExport = vi.fn();
    render(
      <GradebookTable
        gradebook={gradebook}
        onExport={onExport}
        exporting={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "匯出 CSV" }));

    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disables export while exporting", () => {
    render(<GradebookTable gradebook={gradebook} onExport={vi.fn()} exporting />);

    expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeDisabled();
  });

  it("disables export and shows empty state when no students", () => {
    render(
      <GradebookTable
        gradebook={{ ...gradebook, students: [] }}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeDisabled();
    expect(screen.getByText("目前沒有學生或考試")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("disables export and shows empty state when no contests", () => {
    render(
      <GradebookTable
        gradebook={{ ...gradebook, contests: [] }}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(screen.getByRole("button", { name: "匯出 CSV" })).toBeDisabled();
    expect(screen.getByText("目前沒有學生或考試")).toBeInTheDocument();
  });
});
