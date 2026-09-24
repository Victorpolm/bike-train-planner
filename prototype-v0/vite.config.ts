import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { ojpDevelopment } from "./server/devMiddleware";

export default defineConfig(({ mode }) => ({
  plugins: [react(), ojpDevelopment(loadEnv(mode, process.cwd(), "OJP_").OJP_API_KEY)],
}));
