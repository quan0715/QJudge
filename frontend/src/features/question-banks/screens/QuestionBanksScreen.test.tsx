import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

vi.mock("@/shared/contexts", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));
vi.mock("@/features/auth", () => ({
  useAuth: () => ({
    user: { role: "teacher" },
  }),
}));

const listMineMock = vi.fn();
const listInboxMock = vi.fn();
const ingestInboxMock = vi.fn();
const createMock = vi.fn();
const listReviewQueueMock = vi.fn();

vi.mock("@/infrastructure/api/repositories/questionBank.repository", () => ({
  listMine: (...args: unknown[]) => listMineMock(...args),
  listInbox: (...args: unknown[]) => listInboxMock(...args),
  ingestInbox: (...args: unknown[]) => ingestInboxMock(...args),
  create: (...args: unknown[]) => createMock(...args),
  listReviewQueue: (...args: unknown[]) => listReviewQueueMock(...args),
}));

import QuestionBanksScreen from "./QuestionBanksScreen";

describe("QuestionBanksScreen", () => {
  beforeEach(() => {
    listMineMock.mockReset();
    listInboxMock.mockReset();
    ingestInboxMock.mockReset();
    createMock.mockReset();
    listReviewQueueMock.mockReset();

    listMineMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "我的程式題庫",
        description: "mine",
        category: "coding",
        visibility: "private",
        verified: false,
        reviewStatus: "draft",
        questionCount: 0,
      },
    ]);
    listInboxMock.mockResolvedValue({
      coding: [],
      exam: [],
      counts: { coding: 0, exam: 0 },
    });
    ingestInboxMock.mockResolvedValue({
      targetBankId: "11111111-1111-4111-8111-111111111111",
      requestedCount: 0,
      ingestedCount: 0,
      movedCount: 0,
      questionIds: [],
    });
  });

  it("renders mine/inbox tabs", async () => {
    render(
      <MemoryRouter>
        <QuestionBanksScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "我的題庫" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "收編題目" })).toBeInTheDocument();
      expect(screen.getAllByText("我的程式題庫").length).toBeGreaterThan(0);
    });
  });

  it("opens inbox tab from query string", async () => {
    listInboxMock.mockResolvedValue({
      coding: [
        {
          sourceType: "problem",
          sourceId: "11111111-1111-4111-8111-111111111101",
          title: "Draft coding question",
        },
      ],
      exam: [],
      counts: { coding: 1, exam: 0 },
    });

    render(
      <MemoryRouter initialEntries={["/question-banks?tab=inbox"]}>
        <QuestionBanksScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "收編題目" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText("Draft coding question")).toBeInTheDocument();
    });
  });

  it("applies inbox category filter from query string", async () => {
    listMineMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "我的程式題庫",
        description: "mine",
        category: "coding",
        visibility: "private",
        verified: false,
        reviewStatus: "draft",
        questionCount: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "我的考卷題庫",
        description: "mine",
        category: "exam",
        visibility: "private",
        verified: false,
        reviewStatus: "draft",
        questionCount: 0,
      },
    ]);
    listInboxMock.mockResolvedValue({
      coding: [
        {
          sourceType: "problem",
          sourceId: "11111111-1111-4111-8111-111111111001",
          title: "coding item",
        },
      ],
      exam: [
        {
          sourceType: "exam_question",
          sourceId: "22222222-2222-4222-8222-222222222002",
          title: "exam item",
        },
      ],
      counts: { coding: 1, exam: 1 },
    });

    render(
      <MemoryRouter initialEntries={["/question-banks?tab=inbox&category=coding"]}>
        <QuestionBanksScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      // With coding filter, only coding items should appear as cards
      expect(screen.getByText("coding item")).toBeInTheDocument();
      expect(screen.queryByText("exam item")).not.toBeInTheDocument();
    });
  });
});
