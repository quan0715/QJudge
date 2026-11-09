import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AppEntryScreen from "./AppEntryScreen";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function LoginDestination() {
  const { pathname, search, hash } = useLocation();
  return <p>{pathname}{search}{hash}</p>;
}

describe("application entry after website extraction", () => {
  it("retains query and fragment when redirecting the public product entry", () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { hostname: "q-judge.com", replace });
    render(<MemoryRouter initialEntries={["/?lang=en&utm_source=course#landing-faq"]}><AppEntryScreen /></MemoryRouter>);
    expect(replace).toHaveBeenCalledWith("https://www.q-judge.com/?lang=en&utm_source=course#landing-faq");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.q-judge.com/?lang=en&utm_source=course#landing-faq");
  });

  it.each(["localhost", "school.example.org", "staging.q-judge.com", "www.q-judge.com"])("keeps %s on its own login flow", (hostname) => {
    const replace = vi.fn();
    vi.stubGlobal("location", { hostname, replace });
    render(<MemoryRouter initialEntries={["/?lang=en#section"]}><Routes>
      <Route path="/" element={<AppEntryScreen />} />
      <Route path="/login" element={<LoginDestination />} />
    </Routes></MemoryRouter>);
    expect(screen.getByText("/login?lang=en#section")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
