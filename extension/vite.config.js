import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "src",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popup: "app/popup/index.js",
        options: "app/options/index.js"
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "popup") {
            return "popup/popup.bundle.js";
          }
          if (chunkInfo.name === "options") {
            return "options/options.bundle.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
