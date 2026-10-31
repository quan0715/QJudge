import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingEntryScreen from "./LandingEntryScreen";

vi.mock("./LandingScreen", () => ({ default: () => <h1>Local landing</h1> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("canonical landing entry", () => {
  it("preserves language, query parameters and section at the public app entry", () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { hostname: "q-judge.com", replace });
    render(<MemoryRouter initialEntries={["/?lang=en&utm_source=course#landing-faq"]}><LandingEntryScreen /></MemoryRouter>);
    expect(replace).toHaveBeenCalledWith("https://www.q-judge.com/?lang=en&utm_source=course#landing-faq");
    expect(screen.queryByText("Local landing")).not.toBeInTheDocument();
  });

  it.each(["localhost", "school.example.org", "www.q-judge.com"])("keeps %s local without a redirect loop", (hostname) => {
    const replace = vi.fn();
    vi.stubGlobal("location", { hostname, replace });
    render(<MemoryRouter><LandingEntryScreen /></MemoryRouter>);
    expect(screen.getByText("Local landing")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
