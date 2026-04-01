import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

vi.mock("@/shared/contexts", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const listExploreMock = vi.fn();
vi.mock("@/infrastructure/api/repositories/questionBank.repository", () => ({
  listExplore: (...args: unknown[]) => listExploreMock(...args),
}));

import QuestionBankMarketplaceScreen from "./QuestionBankMarketplaceScreen";

describe("QuestionBankMarketplaceScreen", () => {
  it("renders marketplace cards", async () => {
    listExploreMock.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "QJudge Community 程式題庫",
        description: "platform",
        icon: "",
        coverUrl: "",
        category: "coding",
        visibility: "public",
        verified: true,
        reviewStatus: "approved",
        questionCount: 1,
        source: "platform",
      },
    ]);

    render(
      <MemoryRouter>
        <QuestionBankMarketplaceScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("QJudge Community 程式題庫").length).toBeGreaterThan(0);
      expect(screen.getByText("Marketplace")).toBeInTheDocument();
    });
  });
});
