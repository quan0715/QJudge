const CANONICAL_HOST = "www.q-judge.com";
const PAGES_DEV_HOST = "qjudge-landing.pages.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === PAGES_DEV_HOST) {
      url.hostname = CANONICAL_HOST;
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
