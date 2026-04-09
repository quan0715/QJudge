import { describe, it, expect } from "vitest";
import { selectPrimaryCountdownFromRegistry } from "./violationRoutes";

describe("selectPrimaryCountdownFromRegistry", () => {
  it("returns null when all countdowns are null", () => {
    const m = new Map<string, number | null>();
    m.set("screen_share", null);
    m.set("fullscreen", null);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: null, source: null });
  });

  it("returns null when map is empty", () => {
    const result = selectPrimaryCountdownFromRegistry(new Map());
    expect(result).toEqual({ value: null, source: null });
  });

  it("returns the single active countdown", () => {
    const m = new Map<string, number | null>();
    m.set("fullscreen", 5);
    m.set("tab_hidden", null);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 5, source: "fullscreen" });
  });

  it("returns highest priority (lowest countdownPriority) when multiple active", () => {
    const m = new Map<string, number | null>();
    m.set("screen_share", 8);    // priority 0
    m.set("fullscreen", 3);       // priority 3
    m.set("tab_hidden", 5);       // priority 5

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 8, source: "screen_share" });
  });

  it("viewport (priority 2) beats fullscreen (priority 3)", () => {
    const m = new Map<string, number | null>();
    m.set("viewport", 2);
    m.set("fullscreen", 5);

    const result = selectPrimaryCountdownFromRegistry(m);
    expect(result).toEqual({ value: 2, source: "viewport" });
  });
});
