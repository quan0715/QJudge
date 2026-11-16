import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { source } from "../source.server";
import { DocsLayout, resolveLegacyUrl } from "@popcornt/mimi";
export function loader() {
  return {
    routes: source.routes(),
    config: source.config,
    page: source.loadDoc({
      locale: source.config.defaultLocale,
      slug: source.config.navigation[0].items[0],
    })!,
    entries: source
      .searchEntries(source.config.defaultLocale)
      .map(({ title, url, slug }) => ({ title, url, slug })),
    title: source.config.title,
    locale: source.config.defaultLocale,
    base: source.config.basePath,
    links: source.pages().map((p) => ({ url: p.url, title: p.title })),
  };
}
export default function Home() {
  const data = useLoaderData<typeof loader>();
  useEffect(() => {
    const target = resolveLegacyUrl(
      data.config,
      window.location.hash,
      window.location.search,
      data.routes,
    );
    if (target) window.location.replace(target);
  }, [data]);
  return (
    <DocsLayout config={data.config} page={data.page} entries={data.entries} />
  );
}

export function meta({ data }: { data: ReturnType<typeof loader> }) {
  return data
    ? [
        { title: data.title },
        { tagName: "link", rel: "canonical", href: data.page.canonicalUrl },
      ]
    : [];
}
