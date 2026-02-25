import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { APIKeyPanel } from "./APIKeyPanel";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock repository
vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  getAPIKeyInfo: vi.fn(),
  setAPIKey: vi.fn(),
  deleteAPIKey: vi.fn(),
}));

import {
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
} from "@/infrastructure/api/repositories/auth.repository";

const mockGetAPIKeyInfo = vi.mocked(getAPIKeyInfo);
const mockSetAPIKey = vi.mocked(setAPIKey);
const mockDeleteAPIKey = vi.mocked(deleteAPIKey);

/** Helper: get the "新增 API Key" CTA button (not the modal heading) */
const getAddButton = () =>
  screen.getByRole("button", { name: /新增 API Key/ });

/** Helper: open the add/update modal by clicking the CTA button */
const openModal = async (buttonText: RegExp) => {
  const btn = await screen.findByRole("button", { name: buttonText });
  fireEvent.click(btn);
  // Wait for modal input to appear
  return screen.findByLabelText("Anthropic API Key");
};

describe("APIKeyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Display states ─────────────────────────────────────────────────

  it("shows empty state when user has no API key", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: { has_key: false },
    } as any);

    render(<APIKeyPanel />);

    await waitFor(() => {
      expect(screen.getByText("尚未設定 API Key")).toBeInTheDocument();
    });
    expect(getAddButton()).toBeInTheDocument();
  });

  it("shows API key info when user has a key", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: {
        has_key: true,
        is_validated: true,
        is_active: true,
        key_name: "My Key",
        total_requests: 42,
        total_input_tokens: 1000,
        total_output_tokens: 500,
        total_cost_usd: 0.05,
        created_at: "2026-01-01T00:00:00Z",
      },
    } as any);

    render(<APIKeyPanel />);

    await waitFor(() => {
      expect(screen.getByText("API Key 資訊")).toBeInTheDocument();
    });
    expect(screen.getByText("My Key")).toBeInTheDocument();
    expect(screen.getByText("已驗證")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows error notification when getAPIKeyInfo fails", async () => {
    mockGetAPIKeyInfo.mockRejectedValue(new Error("Network error"));

    render(<APIKeyPanel />);

    await waitFor(() => {
      expect(screen.getAllByText(/Network error/).length).toBeGreaterThan(0);
    });
  });

  // ── Modal & save flow ──────────────────────────────────────────────

  it("opens modal when clicking add button", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: { has_key: false },
    } as any);

    render(<APIKeyPanel />);
    const input = await openModal(/新增 API Key/);
    expect(input).toBeInTheDocument();
  });

  it("validates API key format client-side", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: { has_key: false },
    } as any);

    render(<APIKeyPanel />);
    const input = await openModal(/新增 API Key/);

    fireEvent.change(input, { target: { value: "invalid-key" } });
    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() => {
      expect(screen.getAllByText(/無效的 API Key 格式/).length).toBeGreaterThan(0);
    });
    expect(mockSetAPIKey).not.toHaveBeenCalled();
  });

  it("submits valid API key successfully", async () => {
    mockGetAPIKeyInfo
      .mockResolvedValueOnce({ success: true, data: { has_key: false } } as any)
      .mockResolvedValueOnce({
        success: true,
        data: { has_key: true, is_validated: true, is_active: true, key_name: "My API Key" },
      } as any);
    mockSetAPIKey.mockResolvedValue({ success: true } as any);

    render(<APIKeyPanel />);
    const input = await openModal(/新增 API Key/);

    fireEvent.change(input, { target: { value: "sk-ant-api03-testkey123" } });
    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() => {
      expect(mockSetAPIKey).toHaveBeenCalledWith({
        api_key: "sk-ant-api03-testkey123",
        key_name: "My API Key",
      });
    });
  });

  it("shows error when API key save fails", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: { has_key: false },
    } as any);
    mockSetAPIKey.mockRejectedValue(new Error("Validation failed"));

    render(<APIKeyPanel />);
    const input = await openModal(/新增 API Key/);

    fireEvent.change(input, { target: { value: "sk-ant-api03-badkey" } });
    fireEvent.click(screen.getByText("儲存"));

    await waitFor(() => {
      expect(screen.getAllByText(/Validation failed/).length).toBeGreaterThan(0);
    });
  });

  // ── Delete flow ────────────────────────────────────────────────────

  it("deletes API key after confirmation", async () => {
    mockGetAPIKeyInfo
      .mockResolvedValueOnce({
        success: true,
        data: { has_key: true, is_validated: true, is_active: true, key_name: "My Key" },
      } as any)
      .mockResolvedValueOnce({ success: true, data: { has_key: false } } as any);
    mockDeleteAPIKey.mockResolvedValue({ success: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<APIKeyPanel />);

    await waitFor(() => {
      expect(screen.getByText("刪除 Key")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("刪除 Key"));

    await waitFor(() => {
      expect(mockDeleteAPIKey).toHaveBeenCalled();
    });
  });

  it("does not delete when user cancels confirmation", async () => {
    mockGetAPIKeyInfo.mockResolvedValue({
      success: true,
      data: { has_key: true, is_validated: true, is_active: true, key_name: "My Key" },
    } as any);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<APIKeyPanel />);

    await waitFor(() => {
      fireEvent.click(screen.getByText("刪除 Key"));
    });

    expect(mockDeleteAPIKey).not.toHaveBeenCalled();
  });
});
