import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5000",
      "/logout": "http://127.0.0.1:5000",
      // Flask-rendered pages and static assets used during auth/logout flows.
      // Without these, a backend redirect to e.g. "/auth" can land on Vite and look "broken".
      "/auth": "http://127.0.0.1:5000",
      "/app": "http://127.0.0.1:5000",
      "/ai": "http://127.0.0.1:5000",
      "/static": "http://127.0.0.1:5000",
      "/settings": "http://127.0.0.1:5000",
      "/upgrade": "http://127.0.0.1:5000",
      "/feedback": "http://127.0.0.1:5000",
    },
  },
  build: {
    manifest: true,
    outDir: "../static/spa",
    emptyOutDir: true,
    rollupOptions: {
      input: "./index.html",
    },
  },
});
