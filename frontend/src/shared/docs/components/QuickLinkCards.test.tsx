import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { DocQuickLinkCardConfig } from "@/core/docs";
import docsSiteConfig from "../../../../public/docs/config.json";
import { DocsFrameworkProvider } from "../contexts/DocsFrameworkContext";
import QuickLinkCards from "./QuickLinkCards";

const translations: Record<string, string> = {
  "quickLinks.setup.title": "架設與部署",
  "quickLinks.users.title": "建立管理者與教師資格",
  "quickLinks.deployment.title": "架設與部署",
  "quickLinks.administration.title": "建立管理者與教師資格",
  "quickLinks.classroom.title": "準備教室與名冊",
  "quickLinks.exam.title": "準備第一場考試",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => translations[key] ?? fallback ?? key,
  }),
}));

const sampleCards: DocQuickLinkCardConfig[] = [
  {
    id: "setup",
    icon: "server",
    tagType: "blue",
    links: ["deployment", "deployment-storage"],
  },
  {
    id: "users",
    icon: "settings",
    tagType: "purple",
    links: ["admin-account"],
  },
];

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe("QuickLinkCards (shared/docs)", () => {
  it("renders configured quick links in reading order", () => {
    render(
      <MemoryRouter initialEntries={["/guides/overview"]}>
        <DocsFrameworkProvider
          config={{
            brand: { title: "Sample Docs" },
            routeBase: "/guides",
          }}
        >
          <QuickLinkCards cards={sampleCards} />
        </DocsFrameworkProvider>
      </MemoryRouter>,
    );

    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "架設與部署",
      "建立管理者與教師資格",
    ]);
  });

  it("navigates using the configured routeBase", () => {
    render(
      <MemoryRouter initialEntries={["/guides/overview"]}>
        <DocsFrameworkProvider
          config={{
            brand: { title: "Sample Docs" },
            routeBase: "/guides",
          }}
        >
          <QuickLinkCards cards={sampleCards} />
          <LocationProbe />
        </DocsFrameworkProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("架設與部署").closest("a")!);

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/guides/deployment",
    );
  });
});

describe("QJudge config.json QuickLinkCards", () => {
  const qjudgeQuickLinks = docsSiteConfig.quickLinks as DocQuickLinkCardConfig[];

  it("presents the administrator journey in reading order", () => {
    render(
      <MemoryRouter initialEntries={["/docs/overview"]}>
        <DocsFrameworkProvider
          config={{
            brand: { title: "QJudge Docs" },
            routeBase: "/docs",
          }}
        >
          <QuickLinkCards cards={qjudgeQuickLinks} />
        </DocsFrameworkProvider>
      </MemoryRouter>,
    );

    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "架設與部署",
      "建立管理者與教師資格",
      "準備教室與名冊",
      "準備第一場考試",
    ]);
  });

  it("opens the first deployment step from the first card", () => {
    render(
      <MemoryRouter initialEntries={["/docs/overview"]}>
        <DocsFrameworkProvider
          config={{
            brand: { title: "QJudge Docs" },
            routeBase: "/docs",
          }}
        >
          <QuickLinkCards cards={qjudgeQuickLinks} />
          <LocationProbe />
        </DocsFrameworkProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("架設與部署").closest("a")!);

    expect(screen.getByTestId("location")).toHaveTextContent("/docs/deployment");
  });
});
