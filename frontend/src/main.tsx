import { createRoot } from "react-dom/client";
import "./styles/globals.scss";
import "./styles/fonts.css"; // Self-hosted JetBrains Mono font
// import "github-markdown-css/github-markdown-light.css";
import "./i18n";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
