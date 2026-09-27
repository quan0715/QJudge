/**
 * Global Setup for E2E Tests
 *
 * Waits for an already running stack (installed by `ci/e2e-stack.sh`) to
 * serve the backend and the frontend. Override the probed URLs with
 * E2E_BACKEND_HEALTH_URLS / E2E_FRONTEND_HEALTH_URLS (comma-separated).
 */

const MAX_ATTEMPTS = 60;

function getHealthUrls(envName: string, defaults: string[]): string[] {
  const envValue = process.env[envName];
  if (!envValue) return defaults;
  return envValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const backendHealthUrls = () =>
  getHealthUrls("E2E_BACKEND_HEALTH_URLS", ["http://localhost:8080/api/health/"]);

const frontendHealthUrls = () =>
  getHealthUrls("E2E_FRONTEND_HEALTH_URLS", ["http://localhost:8080/"]);

async function getUrlStatus(url: string, timeoutMs = 2000): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function firstReachableUrl(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if ((await getUrlStatus(url)) === 200) return url;
  }
  return null;
}

async function waitFor(name: string, urls: string[]): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const url = await firstReachableUrl(urls);
    if (url) {
      console.log(`✅ ${name} is ready (${url})`);
      return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `${name} not reachable at ${urls.join(", ")}. Start the stack with ci/e2e-stack.sh first.`
  );
}

/** Load the SPA entry points once so the first test does not pay for it. */
async function warmupFrontend(frontendUrl: string) {
  const origin = frontendUrl.replace(/\/$/, "");
  for (const page of ["/login", "/problems"]) {
    await getUrlStatus(`${origin}${page}`, 30000);
  }
}

async function globalSetup() {
  await waitFor("Backend", backendHealthUrls());
  const frontendUrl = await waitFor("Frontend", frontendHealthUrls());
  await warmupFrontend(frontendUrl);
}

export default globalSetup;
