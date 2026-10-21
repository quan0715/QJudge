import { fireEvent, render, screen } from "@testing-library/react";
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
  it("renders contest headers with type tag and max score", () => {
    render(
      <GradebookTable
        gradebook={gradebook}
        onExport={vi.fn()}
        exporting={false}
      />,
    );

    expect(screen.getByText("程式")).toBeInTheDocument();
    expect(screen.getByText("考卷")).toBeInTheDocument();
    expect(screen.getByText("Lab 1")).toBeInTheDocument();
    expect(screen.getByText("滿分 300.00")).toBeInTheDocument();
    expect(screen.getByText("滿分 120.00")).toBeInTheDocument();

    const midtermHeader = screen.getByRole("columnheader", { name: /期中考/ });
    expect(midtermHeader).toHaveTextContent("滿分 120.00");
    expect(midtermHeader.textContent).not.toContain("Invalid");
    expect(midtermHeader.textContent).not.toContain("·");
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

    expect(screen.getByText("300.00")).toBeInTheDocument();
    expect(screen.getByText("96.00")).toBeInTheDocument();
    expect(screen.getByText("210.00")).toBeInTheDocument();
    expect(screen.getByLabelText("未參加")).toHaveTextContent("—");
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
