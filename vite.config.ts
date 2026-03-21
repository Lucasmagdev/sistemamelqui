import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
        if (id.includes("node_modules")) {
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("jspdf")) return "pdf";
          if (
            id.includes("react") ||
              id.includes("react-dom") ||
              id.includes("react-router-dom") ||
              id.includes("@tanstack/react-query")
            ) {
              return "react-vendor";
            }
          }

          return undefined;
        },
      },
    },
  },
}));
