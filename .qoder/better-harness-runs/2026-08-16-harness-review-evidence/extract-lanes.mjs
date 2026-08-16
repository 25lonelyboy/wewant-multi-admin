// 从冻结的 evidence-bundle 中提取三条专家通道的独立证据文件（仅读取、不修改 bundle）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const base = '.qoder/better-harness-runs/2026-08-16-harness-review';
const bundle = JSON.parse(readFileSync(`${base}/evidence-bundle.json`, 'utf8'));
const dir = `${base}/lanes`;
mkdirSync(dir, { recursive: true });
for (const lane of ['sessionEvidence', 'projectHarness', 'agentCustomize']) {
  if (!bundle.lanes?.[lane]) {
    console.error(`lane missing: ${lane}`);
    process.exit(1);
  }
  writeFileSync(
    `${dir}/${lane}.json`,
    JSON.stringify(bundle.lanes[lane], null, 2)
  );
  console.log(`extracted: ${lane}`);
}
