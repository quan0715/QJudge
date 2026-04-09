import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/shared/ui/theme/ThemeContext";
import { ContentLanguageProvider } from "@/shared/contexts/ContentLanguageContext";
import landingZhTW from "@/i18n/locales/zh-TW/landing.json";
import LandingScreen from "./LandingScreen";

function translateKey(key: string, source: Record<string, unknown>) {
  return key.split(".").reduce<unknown>((value, segment) => {
    if (Array.isArray(value)) {
      return value[Number(segment)];
    }
    if (value && typeof value === "object") {
      return (value as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const value = translateKey(key, landingZhTW as Record<string, unknown>);
        return typeof value === "string" ? value : key;
      },
      i18n: {
        changeLanguage: vi.fn(),
      },
    }),
  };
});

function renderScreen() {
  return render(
    <HelmetProvider>
      <ThemeProvider>
        <ContentLanguageProvider>
          <MemoryRouter>
            <LandingScreen />
          </MemoryRouter>
        </ContentLanguageProvider>
      </ThemeProvider>
    </HelmetProvider>,
  );
}

describe("LandingScreen", () => {
  it("renders all primary landing sections in order", () => {
    renderScreen();

    const sections = [
      "landing-section-hero",
      "landing-section-features",
      "landing-section-details",
      "landing-section-flow",
      "landing-section-audience",
      "landing-section-social-proof",
      "landing-section-pricing",
      "landing-section-faq",
      "landing-section-footer",
    ];

    sections.forEach((sectionId) => {
      expect(screen.getByTestId(sectionId)).toBeInTheDocument();
    });
  });

  it("renders hero primary and secondary ctas", () => {
    renderScreen();

    expect(screen.getAllByRole("button", { name: "免費開始使用" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "預約 Demo" }).length).toBeGreaterThan(0);
  });

  it("switches the audience tabs", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("tab", { name: "APCS 模擬考" }));
    expect(
      screen.getAllByText("一家程式培訓機構需要頻繁舉辦 APCS 模擬考，但出題耗時且缺乏完整的模擬考場環境。").length,
    ).toBeGreaterThan(0);
  });

  it("expands the first faq item by default", () => {
    renderScreen();

    expect(
      screen.getByText("QJudge 專為考試設計，提供問卷工具缺乏的防作弊機制、鑑別度分析、個人題庫與自動批改。"),
    ).toBeInTheDocument();
  });
});
