import { useLoaderData } from "react-router";
import { DocsLayout } from "@popcornt/mimi";
import { source } from "../source.server";
export function loader({
  params,
}: {
  params: Record<string, string | undefined>;
}) {
  const page = source.loadDoc({
    locale: params.locale || "",
    slug: (params["*"] || "").replace(/\/$/, ""),
  });
  if (!page) throw new Response("Not found", { status: 404 });
  return {
    page,
    availableLocales: source.config.locales.filter((locale) =>
      source.loadDoc({ locale, slug: page.slug }),
    ),
    alternates: source
      .pages()
      .filter((p) => p.slug === page.slug)
      .map((p) => ({ locale: p.contentLocale, url: p.canonicalUrl })),
    config: source.config,
    entries: source
      .searchEntries(page.requestedLocale)
      .map(({ title, url, slug }) => ({ title, url, slug })),
  };
}
export function meta({ data }: { data: ReturnType<typeof loader> }) {
  if (!data) return [{ title: "404" }];
  return [
    { title: data.page.title + " | " + data.config.title },
    { name: "description", content: data.page.description || data.page.title },
    { tagName: "link", rel: "canonical", href: data.page.canonicalUrl },
    ...data.alternates.map((a) => ({
      tagName: "link",
      rel: "alternate",
      hrefLang: a.locale,
      href: a.url,
    })),
  ];
}
export default function Article() {
  return <DocsLayout {...useLoaderData<typeof loader>()} />;
}
