import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM + CJS 双格式：消费方横跨 Vite（ESM）、Nest（type: module）、jest（CJS）
  format: ['esm', 'cjs'],
  // 生成 .d.ts（ESM 对应 index.d.ts，CJS 对应 index.d.cts）
  dts: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral'
});
