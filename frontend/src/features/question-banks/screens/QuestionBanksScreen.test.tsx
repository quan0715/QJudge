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

const listMineMock = vi.fn();
const listExploreMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/infrastructure/api/repositories/questionBank.repository", () => ({
  listMine: (...args: unknown[]) => listMineMock(...args),
  listExplore: (...args: unknown[]) => listExploreMock(...args),
  create: (...args: unknown[]) => createMock(...args),
}));

import QuestionBanksScreen from "./QuestionBanksScreen";

describe("QuestionBanksScreen", () => {
  beforeEach(() => {
    listMineMock.mockReset();
    listExploreMock.mockReset();
    createMock.mockReset();

    listMineMock.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "我的程式題庫",
        description: "mine",
        category: "coding",
        visibility: "private",
        verified: false,
        questionCount: 0,
      },
    ]);
    listExploreMock.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "QJudge Community 程式題庫",
        description: "platform",
        category: "coding",
        visibility: "public",
        verified: true,
        questionCount: 1,
        source: "platform",
      },
    ]);
  });

  it("renders my/explore tabs with card gallery style", async () => {
    render(
      <MemoryRouter>
        <QuestionBanksScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "我的題庫" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "探索題庫" })).toBeInTheDocument();
      expect(screen.getByText("我的程式題庫")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: "探索題庫" }));

    await waitFor(() => {
      expect(screen.getByText("Mock Card Gallery")).toBeInTheDocument();
      expect(screen.getByText("QJudge Community 程式題庫")).toBeInTheDocument();
    });
  });
});
