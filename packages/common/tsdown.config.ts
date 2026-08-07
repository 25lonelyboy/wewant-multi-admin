import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM + CJS 双格式：顺带解决之前提过的 Jest(CJS) 消费缺口
  format: ['esm', 'cjs'],
  // 生成 .d.ts（ESM 对应 index.d.ts，CJS 对应 index.d.cts）
  dts: true,
  // 构建前清空 dist
  clean: true,
  target: 'es2022',
  // 库是前后端共用的，保持平台中立
  platform: 'neutral'
});
