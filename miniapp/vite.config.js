import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // admin.html — mijoz ilovasidan butunlay alohida bundle, alohida login
      // (username/parol) bilan kiriladigan Admin Panel uchun.
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
