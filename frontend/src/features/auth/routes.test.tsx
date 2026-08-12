import { render } from "@testing-library/react";
import { isValidElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { oauthCallback } from "@/infrastructure/api/repositories/auth.repository";
import { oauthCallbackRoute } from "./routes";

vi.mock("@/infrastructure/api/repositories/auth.repository", () => ({
  oauthCallback: vi.fn(),
}));

describe("OAuth callback route", () => {
  beforeEach(() => {
    vi.mocked(oauthCallback).mockReset();
    vi.mocked(oauthCallback).mockReturnValue(new Promise(() => {}));
  });

  it("starts exchanging the short-lived code during the initial render", () => {
    const callbackElement = isValidElement<{ element: ReactNode }>(oauthCallbackRoute)
      ? oauthCallbackRoute.props.element
      : null;

    render(
      <MemoryRouter initialEntries={["/auth/nycu/callback?code=short-lived-code"]}>
        {callbackElement}
      </MemoryRouter>,
    );

    expect(oauthCallback).toHaveBeenCalledWith("nycu", "short-lived-code");
  });
});
