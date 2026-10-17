import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "@carbon/icons-react";
import { describe, expect, it, vi } from "vitest";

import AdminShellLayout, { type NavItem, type SideNavMode } from "./AdminShellLayout";

const navItem = (overrides: Partial<NavItem> = {}): NavItem => ({
  id: "overview",
  icon: Dashboard,
  label: "Overview",
  isActive: false,
  onClick: vi.fn(),
  ...overrides,
});

const shell = (item: NavItem, sideNavMode: SideNavMode = { variant: "expanded" }) => (
  <AdminShellLayout
    headerAriaLabel="Admin"
    headerLeft={null}
    headerActions={null}
    sideNavAriaLabel="Admin navigation"
    sideNavMode={sideNavMode}
    navItems={[item]}
  >
    <p>content</p>
  </AdminShellLayout>
);

const renderShell = (item: NavItem) => render(shell(item));

const navLink = () => {
  const link = screen.getByText("Overview").closest("a");
  if (!link) throw new Error("no nav link");
  return link;
};

const click = (init: MouseEventInit) => {
  const event = createEvent.click(navLink(), { button: 0, ...init });
  fireEvent(navLink(), event);
  return event;
};

describe("AdminShellLayout nav items", () => {
  it("handles a plain click on a linked item in the app instead of loading the page", () => {
    const onClick = vi.fn();
    renderShell(navItem({ href: "/system", onClick }));

    expect(navLink().getAttribute("href")).toBe("/system");
    expect(click({}).defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
  ])("leaves a %s-click on a linked item to the browser", (_name, init) => {
    const onClick = vi.fn();
    renderShell(navItem({ href: "/system", onClick }));
    // Runs after React's handlers; jsdom cannot open a new tab, so cancel it once recorded.
    let preventedByShell: boolean | null = null;
    const record = (event: Event) => {
      preventedByShell = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", record);

    try {
      click(init);
    } finally {
      document.removeEventListener("click", record);
    }

    expect(preventedByShell).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps an item without href working as before", async () => {
    const onClick = vi.fn();
    renderShell(navItem({ onClick }));

    expect(navLink().hasAttribute("href")).toBe(false);
    await userEvent.click(navLink());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("AdminShellLayout side nav mode", () => {
  // Carbon makes a collapsed nav inert, which hides its links from the keyboard and screen readers.
  const sideNavIsReachable = () =>
    !screen.getByRole("navigation", { name: "Admin navigation" }).hasAttribute("inert");

  it("keeps the nav reachable after growing out of rail mode", () => {
    const item = navItem();
    const { rerender } = render(shell(item, { variant: "rail" }));
    expect(sideNavIsReachable()).toBe(true);

    rerender(shell(item, { variant: "expanded" }));

    expect(sideNavIsReachable()).toBe(true);
  });

  it("keeps the nav reachable after shrinking into rail mode", () => {
    const item = navItem();
    const { rerender } = render(shell(item, { variant: "expanded" }));
    expect(sideNavIsReachable()).toBe(true);

    rerender(shell(item, { variant: "rail" }));

    expect(sideNavIsReachable()).toBe(true);
  });
});
