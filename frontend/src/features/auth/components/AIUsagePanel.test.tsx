import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "@/infrastructure/api/http.client";
import { AIUsagePanel } from "./AIUsagePanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AIUsagePanel", () => {
  it("renders token usage and run count from the canonical usage route", async () => {
    const get = vi.spyOn(httpClient, "get").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          total_input_tokens: 1234,
          total_output_tokens: 567,
          total_runs: 8,
          updated_at: "2026-08-06T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<AIUsagePanel />);

    await waitFor(() => expect(screen.getByText("輸入 Tokens")).toBeVisible());
    expect(screen.getByText("輸出 Tokens")).toBeVisible();
    expect(screen.getByText("AI 執行次數")).toBeVisible();
    expect(screen.getByText("1,234")).toBeVisible();
    expect(screen.getByText("567")).toBeVisible();
    expect(screen.getByText("8")).toBeVisible();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/api/v1/ai/usage/");
    expect(
      get.mock.calls.some(([url]) => String(url).includes("/credit/")),
    ).toBe(false);
  });
});
