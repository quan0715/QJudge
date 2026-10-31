import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ProductVideoSection from "./ProductVideoSection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("product video hosting", () => {
  it("avoids the main app's backend upload route", () => {
    vi.stubEnv("VITE_LANDING_PUBLIC_URL", "");
    const { container } = render(<ProductVideoSection />);
    const video = container.querySelector("video")!;
    expect(video.querySelector("source")?.getAttribute("src")).toBe("https://www.q-judge.com/media/QJudge-launch-v4.mp4");
    expect(video.getAttribute("poster")).toBe("https://www.q-judge.com/media/QJudge-launch-v4.jpg");
    expect(video.controls).toBe(true);
  });

  it("uses local assets in standalone builds and preview deployments", () => {
    vi.stubEnv("VITE_LANDING_PUBLIC_URL", "https://www.q-judge.com");
    const { container } = render(<ProductVideoSection />);
    expect(container.querySelector("source")?.getAttribute("src")).toBe("/media/QJudge-launch-v4.mp4");
    expect(container.querySelector("video")?.getAttribute("poster")).toBe("/media/QJudge-launch-v4.jpg");
  });
});
