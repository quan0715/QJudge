import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import LandingScreen from "./LandingScreen";

// The public app homepage uses the canonical site's deployed content.
// Local development and self-hosted installations keep their own landing page.
export default function LandingEntryScreen() {
  const { search, hash } = useLocation();
  const isPublicApp = window.location.hostname === "q-judge.com";
  const destination = `https://www.q-judge.com/${search}${hash}`;

  useEffect(() => {
    if (isPublicApp) window.location.replace(destination);
  }, [isPublicApp, destination]);

  return isPublicApp
    ? <a href={destination}>QJudge</a>
    : <LandingScreen />;
}
