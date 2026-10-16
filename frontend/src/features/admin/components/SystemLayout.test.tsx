import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import SystemLayout from "./SystemLayout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@/features/app/components/UserMenu", () => {
  const UserMenu = () => <div data-testid="user-menu" />;
  return { UserMenu, default: UserMenu };
});

const SectionProbe = () => {
  const location = useLocation();
  return <p data-testid="section-path">{location.pathname}</p>;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/system" element={<SystemLayout />}>
          <Route index element={<SectionProbe />} />
          <Route path="*" element={<SectionProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const currentPath = () => screen.getByTestId("section-path").textContent;
const sideNav = () => screen.getByRole("navigation", { name: "管理導覽" });
const navLink = (name: string) => {
  const link = within(sideNav()).getByText(name).closest("a");
  if (!link) throw new Error(`no nav link for ${name}`);
  return link;
};

const contentOffset = () =>
  (screen.getByRole("main").parentElement as HTMLElement).style.getPropertyValue(
    "--admin-shell-sidenav-width",
  );

// The global test setup answers every media query with `matches: false` (a wide screen).
const originalMatchMedia = window.matchMedia;
const useViewport = (matchesQuery: (query: string) => boolean) => {
  window.matchMedia = ((query: string) => ({
    ...originalMatchMedia(query),
    matches: matchesQuery(query),
  })) as typeof window.matchMedia;
};

describe("SystemLayout", () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("lists the five sections in order", () => {
    renderAt("/system");

    const labels = Array.from(sideNav().querySelectorAll("a")).map((link) => link.textContent);
    expect(labels).toEqual(["概覽", "使用者", "服務狀態", "Ingress", "系統版本"]);
  });

  it("marks the current section and navigates between sections", async () => {
    renderAt("/system/ingress");
    expect(navLink("Ingress").getAttribute("aria-current")).toBe("page");
    expect(navLink("概覽").getAttribute("aria-current")).toBeNull();

    await userEvent.click(navLink("系統版本"));

    expect(currentPath()).toBe("/system/version");
    expect(navLink("系統版本").getAttribute("aria-current")).toBe("page");
    expect(navLink("Ingress").getAttribute("aria-current")).toBeNull();
  });

  it("marks only the overview at /system, not every section under it", () => {
    renderAt("/system");

    expect(navLink("概覽").getAttribute("aria-current")).toBe("page");
    for (const other of ["使用者", "服務狀態", "Ingress", "系統版本"]) {
      expect(navLink(other).getAttribute("aria-current")).toBeNull();
    }
  });

  it("renders the routed section in the content area", () => {
    renderAt("/system/users");

    expect(currentPath()).toBe("/system/users");
    expect(screen.getByRole("main").contains(screen.getByTestId("section-path"))).toBe(true);
  });

  it("links the brand to the dashboard and names the area in the header", () => {
    renderAt("/system");

    const brand = screen.getByRole("link", { name: "QJudge" });
    expect(brand.getAttribute("href")).toBe("/dashboard");
    const header = screen.getByRole("banner");
    expect(within(header).getByText("系統管理")).toBeTruthy();
    expect(within(header).getByTestId("user-menu")).toBeTruthy();
  });

  it("keeps the full side nav beside the content on wide screens", () => {
    renderAt("/system");

    expect(contentOffset()).toBe("16rem");
  });

  it("collapses the side nav to a rail on phones so the content keeps its width", async () => {
    useViewport((query) => query === "(max-width: 671px)");

    renderAt("/system/ingress");

    expect(contentOffset()).toBe("3rem");
    // The sections stay reachable from the rail.
    expect(navLink("Ingress").getAttribute("aria-current")).toBe("page");
    await userEvent.click(navLink("系統版本"));
    expect(currentPath()).toBe("/system/version");
  });
});
