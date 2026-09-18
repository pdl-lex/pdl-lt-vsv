import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend läuft standardmäßig auf 8077 (8000 kollidiert auf dieser Maschine mit
// einem anderen Dienst). Ziel per VITE_API_TARGET überschreibbar.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8077";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Frontend spricht relativ mit /bundles; der Dev-Server proxyt ans Backend.
      // So funktioniert derselbe Code auch, wenn Backend + statisches Frontend
      // später hinter einem Reverse-Proxy (Traefik) unter gleicher Origin liegen.
      "/bundles": { target: apiTarget, changeOrigin: true },
      "/health": { target: apiTarget, changeOrigin: true },
    },
  },
});
