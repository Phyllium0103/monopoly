import { defineConfig } from 'vite';

// 把遊戲引擎打包成單一 ES 模組，給 Supabase Edge Function（Deno）在伺服器上執行
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/engine/server.ts', formats: ['es'], fileName: () => 'engine.js' },
    outDir: 'supabase/functions/game/_engine',
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    rollupOptions: { external: [] },
  },
  define: { 'import.meta.env.BASE_URL': JSON.stringify('./') },
});
