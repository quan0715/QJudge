import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

import QuickLinkCards from "./QuickLinkCards";

const translations: Record<string, string> = {
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

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe("QuickLinkCards", () => {
  it("presents the administrator journey in reading order", () => {
    render(
      <MemoryRouter initialEntries={["/docs/overview"]}>
        <QuickLinkCards />
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
        <QuickLinkCards />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("架設與部署").closest("a")!);

    expect(screen.getByTestId("location")).toHaveTextContent("/docs/deployment");
  });
});
