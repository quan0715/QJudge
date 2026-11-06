import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Theme } from "@carbon/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/features/auth/contexts/AuthContext";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import GradeAppealsPanel from "@/features/contest/components/GradeAppealsPanel";
import "@/i18n";
import "@/styles/globals.scss";

// Uses actual UI and repositories; Playwright supplies synthetic API responses.
const theme = new URLSearchParams(location.search).get("theme") === "g100" ? "g100" : "white";
document.documentElement.dataset.carbonTheme = theme;
export default function Fixture() {
  const [refreshKey, setRefreshKey] = useState(0);
  return <Theme theme={theme}>
    <main style={{ margin: "1rem", maxWidth: "60rem" }}>
      <Button kind="ghost" onClick={() => setRefreshKey(key => key + 1)}>Reset</Button>
      <GradeAppealsPanel contestId="exam" refreshKey={refreshKey} />
    </main>
  </Theme>;
}
createRoot(document.getElementById("root")!).render(
  <AuthProvider><ToastProvider><MemoryRouter><Fixture /></MemoryRouter></ToastProvider></AuthProvider>,
);
