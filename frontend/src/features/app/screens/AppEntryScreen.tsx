import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

/** Public product entry points to the website; self-hosted instances sign in locally. */
export default function AppEntryScreen() {
  const { search, hash } = useLocation();
  const isPublicApp = window.location.hostname === "q-judge.com";
  const destination = `https://www.q-judge.com/${search}${hash}`;

  useEffect(() => {
    if (isPublicApp) window.location.replace(destination);
  }, [isPublicApp, destination]);

  return isPublicApp
    ? <a href={destination}>QJudge</a>
    : <Navigate to={`/login${search}${hash}`} replace />;
}
