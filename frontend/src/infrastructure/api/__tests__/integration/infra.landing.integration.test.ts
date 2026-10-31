import { get, type IncomingHttpHeaders } from "node:http";
import { describe, expect, it } from "vitest";

const origin = new URL(process.env.API_BASE_URL || "http://localhost:8080").origin;

// Fetch replaces Host with the URL host. Raw HTTP is needed to exercise the
// production virtual host through the local CI port, without following redirects.
function requestLanding(path: string, host: string, accept: string) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    get(`${origin}${path}`, { headers: { Host: host, Accept: accept } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
      response.on("error", reject);
    }).on("error", reject);
  });
}

// Exercise the real frontend ingress: mocks cannot catch Nginx redirect order.
describe("public landing ingress", () => {
  it("redirects browser visits with language and query parameters intact", async () => {
    const response = await requestLanding("/?lang=en&utm_source=course", "q-judge.com", "text/html");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://www.q-judge.com/?lang=en&utm_source=course");
  });

  it("preserves Markdown and discovery headers for agents", async () => {
    const response = await requestLanding("/", "q-judge.com", "text/markdown");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/markdown");
    expect(response.headers.link).toContain('rel="service-desc"');
    expect(response.headers.link).toContain('rel="describedby"');
    expect(response.body).toContain("QJudge");
  });

  it("keeps self-hosted homepages and public app login local", async () => {
    for (const [path, host] of [["/", "school.example.org"], ["/login", "q-judge.com"]]) {
      const response = await requestLanding(path, host, "text/html");
      expect(response.status).toBe(200);
      expect(response.headers.location).toBeUndefined();
      expect(response.headers["content-type"]).toContain("text/html");
    }
  });
});
