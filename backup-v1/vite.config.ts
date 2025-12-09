import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const frontendRoot = path.resolve(__dirname, "frontend");
const frontendSrc = path.resolve(frontendRoot, "src");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: frontendRoot,
  publicDir: path.resolve(frontendRoot, "public"),
  envDir: __dirname,
  server: {
    host: "::",
    port: 8080,
  },
  preview: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": frontendSrc,
    },
  },
}));
