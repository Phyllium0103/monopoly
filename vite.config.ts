import { defineConfig } from 'vite';

export default defineConfig({
  // 相對路徑：部署在 GitHub Pages 子目錄（/monopoly/）也能正確載入資源
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
