import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsModal, type SettingsModalNavItem } from "./SettingsModal";

vi.mock("@carbon/react", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const Icon = () => null;
const baseItems: SettingsModalNavItem[] = [
  { id: "general", label: "General", icon: Icon },
  { id: "access", label: "Access", icon: Icon },
  { id: "display", label: "Display", icon: Icon },
  { id: "cheat", label: "Cheat detection", icon: Icon },
];

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsModal", () => {
  it("accepts a new settings tab without changing a hook dependency array size", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const props = {
      open: true,
      onRequestClose: () => {},
      modalHeading: "Settings",
      renderPanel: () => null,
    };
    const { rerender } = render(<SettingsModal {...props} navItems={baseItems} />);

    rerender(
      <SettingsModal
        {...props}
        navItems={[...baseItems, { id: "integrity", label: "Integrity", icon: Icon }]}
      />,
    );

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "The final argument passed to useMemo changed size",
    );
  });

});
