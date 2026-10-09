import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// Schriften selbst ausliefern statt von Google Fonts: sonst ginge bei jedem
// Seitenaufruf die IP-Adresse an Google (DSGVO; LG München I, 3 O 17493/20).
// Je Schnitt alle Zeichensätze — der Browser lädt per unicode-range nur die nötigen.
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans-mono/400.css";
import "@fontsource/noto-sans-mono/500.css";
import "./styles/tokens.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
