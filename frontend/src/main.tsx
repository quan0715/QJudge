import { createRoot } from "react-dom/client";
import "./styles/global.scss";
import "github-markdown-css/github-markdown-light.css";
import "./i18n";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
