import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "folio-local-dev-csp",
      transformIndexHtml(html: string) {
        return command === "serve"
          ? html.replace(
              "script-src 'self'",
              "script-src 'self' 'unsafe-inline'",
            )
          : html;
      },
    },
  ],
  base: "./",
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
}));
