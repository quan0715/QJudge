import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IngressScreen from "./IngressScreen";
import { getIngress } from "@/infrastructure/api/repositories/system.repository";
import type { IngressEntry } from "@/core/entities/ingress.entity";

const interpolate = (text: string, values?: unknown) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String((values as Record<string, unknown> | undefined)?.[name] ?? ""),
  );
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, values?: unknown) =>
      typeof fallback === "string" ? interpolate(fallback, values) : key,
  }),
}));

vi.mock("@/infrastructure/api/repositories/system.repository", () => ({
  getIngress: vi.fn(),
}));

const entry = (overrides: Partial<IngressEntry> = {}): IngressEntry => ({
  id: "site",
  public: "https://oj.example.test",
  target: "http://127.0.0.1:8080",
  probe: "https://oj.example.test/api/health/",
  ok: true,
  detail: "HTTP 200",
  ...overrides,
});

describe("IngressScreen", () => {
  beforeEach(() => {
    vi.mocked(getIngress).mockReset();
  });

  it("lists each ingress entry with its probe result", async () => {
    vi.mocked(getIngress).mockResolvedValue({
      agent: "ok",
      entries: [
        entry({ id: "site", ok: true, detail: "HTTP 200" }),
        entry({ id: "mcp", ok: false, detail: "refused" }),
      ],
    });

    render(<IngressScreen />);

    await waitFor(() =>
      expect(screen.getByTestId("ingress-mcp").textContent).toContain("refused"),
    );
    expect(screen.getByTestId("ingress-site").textContent).toContain("HTTP 200");
    expect(getIngress).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "重新測試" }));
    expect(getIngress).toHaveBeenCalledTimes(2);
  });

  it("shows where each entry is reached and where it should be forwarded", async () => {
    vi.mocked(getIngress).mockResolvedValue({
      agent: "ok",
      entries: [entry({ id: "storage", public: "https://files.example.test/", target: "http://127.0.0.1:9000" })],
    });

    render(<IngressScreen />);

    const row = await screen.findByTestId("ingress-storage");
    expect(row.textContent).toContain("https://files.example.test/");
    expect(row.textContent).toContain("http://127.0.0.1:9000");
  });

  it("labels a passing and a failing entry differently", async () => {
    vi.mocked(getIngress).mockResolvedValue({
      agent: "ok",
      entries: [entry({ id: "site", ok: true }), entry({ id: "mcp", ok: false })],
    });

    render(<IngressScreen />);

    const site = await screen.findByTestId("ingress-site");
    expect(site.textContent).toContain("正常");
    expect(screen.getByTestId("ingress-mcp").textContent).toContain("異常");
  });

  it("says the probe runs on the host and cannot vouch for the outside network", async () => {
    vi.mocked(getIngress).mockResolvedValue({ agent: "ok", entries: [entry()] });

    render(<IngressScreen />);

    expect(
      await screen.findByText("結果是從主機本身測試，不保證外部網路一定連得到"),
    ).toBeTruthy();
  });

  it.each([
    ["unsupported", "此環境沒有主機 agent，無法測試入口"],
    ["unreachable", "無法連線到主機 agent"],
  ] as const)("explains an %s agent instead of listing entries", async (agent, message) => {
    vi.mocked(getIngress).mockResolvedValue({ agent, entries: [] });

    render(<IngressScreen />);

    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(screen.queryByTestId("ingress-entries")).toBeNull();
    expect(screen.getByRole("button", { name: "重新測試" })).toBeTruthy();
  });

  it("reports a failed load instead of rendering a blank panel", async () => {
    vi.mocked(getIngress).mockRejectedValue(new Error("502 Bad Gateway"));

    render(<IngressScreen />);

    await waitFor(() => expect(screen.getByText("無法讀取 Ingress 狀態")).toBeTruthy());
    expect(screen.getByText("502 Bad Gateway")).toBeTruthy();
  });

  it("can be re-tested after a failed load", async () => {
    vi.mocked(getIngress).mockRejectedValueOnce(new Error("502 Bad Gateway"));
    vi.mocked(getIngress).mockResolvedValueOnce({
      agent: "ok",
      entries: [entry({ id: "mcp", ok: true, detail: "HTTP 401" })],
    });

    render(<IngressScreen />);
    await waitFor(() => expect(screen.getByText("502 Bad Gateway")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "重新測試" }));

    await waitFor(() =>
      expect(screen.getByTestId("ingress-mcp").textContent).toContain("HTTP 401"),
    );
    expect(screen.queryByText("502 Bad Gateway")).toBeNull();
  });
});
