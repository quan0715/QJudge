import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSessions,
  getAuthOptions,
  getOAuthUrl,
  issueTeacherActivationActionLink,
  login,
  logoutOtherSessions,
  oauthCallback,
  register,
} from "./auth.repository";

describe("auth repository endpoints", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    document.cookie = "csrftoken=test-csrf-token";
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    window.localStorage.clear();
  });

  it("issueTeacherActivationActionLink issues a teacher activation action link", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 1,
            created_at: "2026-04-14T00:00:00Z",
            expires_at: "2026-04-15T00:00:00Z",
            status: "pending",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await issueTeacherActivationActionLink("teacher@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/action-links");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      purpose: "teacher_activation",
      email: "teacher@example.com",
    });
  });

  it("getAuthOptions calls auth options endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            password_enabled: false,
            providers: [
              {
                key: "nycu",
                type: "oidc",
                category: "campus",
                display_name: "NYCU 國立陽明交通大學",
                display_name_i18n_key: "auth.providers.nycu",
                logo_url: "/auth-providers/nycu.svg",
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const response = await getAuthOptions();

    expect(response.data.password_enabled).toBe(false);
    expect(response.data.providers[0].key).toBe("nycu");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/providers");
    expect(options.method).toBe("GET");
  });

  it("login uses the password credentials endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { access_token: "token", user: { id: 1 } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await login({ identifier: "alice@example.com", password: "secret" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/login/password");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      identifier: "alice@example.com",
      password: "secret",
    });
  });

  it("register uses the password credentials endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { access_token: "token", user: { id: 1 } } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await register({
      username: "alice",
      email: "alice@example.com",
      password: "secret",
      password_confirm: "secret",
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/register/password");
    expect(options.method).toBe("POST");
  });

  it("OAuth helpers use provider-oriented login and callback endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { authorization_url: "https://provider.example/auth" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { access_token: "token", user: { id: 1 } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await getOAuthUrl("github", "/contests");
    await oauthCallback("github", "code-123");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/login/github?redirect=%2Fcontests");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/callback/github");
  });

  it("session helpers use canonical auth session endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await getAuthSessions();
    await logoutOtherSessions();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/sessions");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/sessions/logout-others");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  });
});
