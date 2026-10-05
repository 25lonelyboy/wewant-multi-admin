#!/usr/bin/env node
/**
 * doc-lint.js — 文档治理校验脚本（project-doc-governance 技能配套工具）
 *
 * 母版：project-doc-governance 技能 scripts/doc-lint.js。
 * 仓库副本：初始化/重组时复制到 <repo>/scripts/ 并登记 AGENTS.md：
 *   - CJS 仓库（根 package.json 无 "type": "module"）：doc-lint.js
 *   - ESM 仓库（根 package.json 有 "type": "module"）：doc-lint.cjs
 * 副本版本落后于母版时（--version 比对），随重组更新。
 *
 * 用法：node doc-lint.js <仓库根目录> [选项]
 *   --budget <n>          AGENTS.md 行数预算，默认 150
 *   --max-doc-lines <n>   事实源活文档体积基线，默认 400（超限仅 WARN）
 *   --hot-index-rows <n>  tasks 热索引数据行数阈值，默认 12（超限仅 WARN）
 *   --ignore <glob>       忽略路径（可重复；* 匹配单段，** 匹配任意深度）
 *   --version             输出版本号，用于仓库副本与技能母版版本比对
 *
 * 检查项：
 *   ① 可达性：docs/ 内每个 md 必须能沿 README 链接从 docs/README.md 抵达；
 *      跳数 > 3 记 WARN。目录缺 README 入口单独报告。
 *   ② 死链：docs/ 与根入口文件内的相对 md 链接必须有效
 *   ③ frontmatter：活文档必须有 status / last_verified（scope=code 时还需 covers）；
 *      status 与 last_verified 的值必须合法
 *   ④ covers 漂移：covers 覆盖代码的最后提交晚于文档最后提交 → 疑似陈旧（需 git）；
 *      covers 路径不存在 → 报错
 *   ⑤ AGENTS.md 行数预算
 *   ⑥ 终态痕迹：事实源层不得出现修订史/自我更正/删除线/免责散文/待办占位
 *      （词表见 final-state-rules.json；行内代码内的词不算，供规则文本列举禁用词）
 *   ⑦ 悬空引用：反引号里的仓库路径必须真实存在；外部链接须标访问日期（后者仅 WARN）
 *   ⑧ tasks 索引一致性：热/冷索引与 docs/tasks/ 实际目录一一对应
 *   ⑨ 活文档体积基线：事实源层活文档超过 --max-doc-lines → WARN
 *
 * 退出码：0 = 全绿或 --version 查询成功；1 = 存在问题或目录不存在。
 * 豁免：README.md、日期前缀文件（YYYY-MM-DD-*）、docs/tasks/ 下的过程文件
 *       不参与检查③④；ADR-* 文件只要求 status 字段，且不参与④⑨；
 *       检查⑥⑦仅作用于事实源层与根入口文件（tasks/ 与 decisions/ 豁免）。
 */
'use strict';

const VERSION = '1.3.0';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log(`doc-lint ${VERSION}`);
  process.exit(0);
}
let repoRoot = process.cwd();
let budget = 150;
let maxDocLines = 400;
let hotIndexRows = 12;
const ignoreGlobs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--budget' && args[i + 1]) {
    budget = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--max-doc-lines' && args[i + 1]) {
    maxDocLines = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--hot-index-rows' && args[i + 1]) {
    hotIndexRows = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--ignore' && args[i + 1]) {
    ignoreGlobs.push(args[i + 1]);
    i++;
  } else if (!args[i].startsWith('--')) {
    repoRoot = path.resolve(args[i]);
  }
}
if (!fs.existsSync(repoRoot)) {
  console.error(`错误：目录不存在 ${repoRoot}`);
  process.exit(1);
}

// ---------- 路径忽略 ----------
function globToRe(glob) {
  const norm = glob.split(path.sep).join('/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') {
        re += '.*';
        i++;
      } else re += '[^/]*';
    } else if ('\\^$+.()|{}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}
const ignoreRes = ignoreGlobs.map(globToRe);
function isIgnored(relPath) {
  if (ignoreRes.length === 0) return false;
  const p = relPath.split(path.sep).join('/');
  return ignoreRes.some(re => re.test(p));
}

const docsDir = path.join(repoRoot, 'docs');
const issues = {
  reach: [],
  deadlink: [],
  frontmatter: [],
  drift: [],
  budget: [],
  finalstate: [],
  dangling: [],
  tasks: []
};
const warnings = [];

// ---------- 工具函数 ----------
function listMdFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isIgnored(rel(full))) continue;
    if (entry.isDirectory()) listMdFiles(full, acc);
    else if (entry.name.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(repoRoot, p).split(path.sep).join('/');
}

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
const ADR_PREFIX = /^ADR-\d{3}-/;

const STATUS_LIVING = ['living', 'snapshot', 'deprecated'];
const STATUS_ADR = ['accepted', 'superseded', 'rejected'];

function isExemptFromFrontmatter(file) {
  const name = path.basename(file);
  if (name.toLowerCase() === 'readme.md') return true;
  if (DATE_PREFIX.test(name)) return true; // 不可变过程记录
  const r = rel(file).split('/');
  if (r[0] === 'docs' && r[1] === 'tasks') return true; // 过程材料
  return false;
}

// 检查④⑨的豁免：按路径 + 按 status。ADR 是决策的日期记录，随代码演进也不更新；
// snapshot / deprecated 按定义不受新鲜度管理（freshness-policy 的豁免清单）。
function isExemptFromDrift(file, fm) {
  if (isExemptFromFrontmatter(file)) return true;
  if (ADR_PREFIX.test(path.basename(file))) return true;
  const status = ((fm && fm.status) || '').trim();
  if (status === 'snapshot' || status === 'deprecated') return true;
  return false;
}

// scope=process 的活文档不描述代码路径，不要求 covers、不参与漂移
function isProcessScoped(fm) {
  return (fm && (fm.scope || '').trim()) === 'process';
}

function todayStr() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let currentKey = null;
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fm[currentKey] = kv[2].trim();
    } else if (currentKey && /^\s+-\s+/.test(line)) {
      // YAML 块列表
      const prev = fm[currentKey];
      const item = line.replace(/^\s+-\s+/, '').trim();
      fm[currentKey] = (
        prev && prev !== '' ? (Array.isArray(prev) ? prev : [prev]) : []
      ).concat(item);
    }
  }
  return fm;
}

function parseCovers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const inline = value.match(/^\[(.*)\]$/);
  if (inline)
    return inline[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  return [value];
}

// ---------- Markdown 预处理 ----------
function blankNonNewline(s) {
  return s.replace(/[^\r\n]/g, ' ');
}

// 剥离 frontmatter 与围栏代码块（围栏行与内容整体置空，保留行结构）。
// 顺序依赖：必须先剥离围栏，否则代码块内未闭合的 <!-- 或反引号会干扰后续正则。
function stripFencesAndFrontmatter(content) {
  let text = content;
  const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) text = blankNonNewline(fm[0]) + text.slice(fm[0].length);

  const lines = text.split(/\r?\n/); // 兼容 CRLF：保留 \r 会使围栏正则的行尾 $ 不匹配
  const out = [];
  let fence = null; // { char, len }
  for (const line of lines) {
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      // 关闭围栏：同字符、长度不小于开启围栏、行内无其他内容
      if (
        m &&
        m[1][0] === fence.char &&
        m[1].length >= fence.len &&
        m[2].trim() === ''
      ) {
        fence = null;
      }
      out.push('');
      continue;
    }
    if (m) {
      fence = { char: m[1][0], len: m[1].length };
      out.push('');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// 产出纯正文：注释与行内代码一并置空（检查①②⑥用）
function extractMarkdownBody(content) {
  let text = stripFencesAndFrontmatter(content);

  // 3) HTML 注释置空（可跨行）
  text = text.replace(/<!--[\s\S]*?-->/g, blankNonNewline);

  // 4) 行内代码 span 置空（先双反引号后单反引号）
  text = text.replace(/``[\s\S]*?``/g, blankNonNewline);
  text = text.replace(/`[^`\r\n]*`/g, blankNonNewline);

  // 已知限制（有意取舍）：
  // - 4 空格缩进代码块不置空：会误伤嵌套列表中的链接索引。
  // - 双反引号跨行 span 可能配对错误：后果为漏报而非误报。
  // - 行内代码 span 内的 `<!--` 可能被 HTML 注释正则在先匹配：同类风险，后果为漏报。
  // 行内代码被清空，使得"规则里用反引号列举禁用词"不会被⑥误报——这是刻意的。

  return text;
}

// 取出行内代码 span 的内容（检查⑦用：反引号里的仓库路径需要被读到，而不是被清空）
function extractInlineCodeSpans(content) {
  const body = stripFencesAndFrontmatter(content);
  const spans = [];
  const re = /``([^`]+?)``|`([^`\r\n]+)`/g;
  let m;
  while ((m = re.exec(body)) !== null) spans.push((m[1] || m[2]).trim());
  return spans;
}

// ---------- 链接抽取（①②共用） ----------
// 容错形态：[x](y)、[x](y "title")、[x](<y z>)、[x](y#anchor)
const LINK_RE = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g;

function extractLinks(body) {
  const out = [];
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(body)) !== null) {
    let t = m[1].trim();
    if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1);
    if (/^(https?:|mailto:|#)/i.test(t)) continue;
    const noAnchor = t.split('#')[0];
    if (!noAnchor) continue;
    try {
      out.push(decodeURIComponent(noAnchor));
    } catch {
      out.push(noAnchor);
    }
  }
  return out;
}

// 把链接目标解析为绝对路径；指向目录时返回该目录的 README.md（若有）
function resolveLink(fromFile, target) {
  const abs = path.resolve(path.dirname(fromFile), target);
  try {
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      const idx = path.join(abs, 'README.md');
      return fs.existsSync(idx) ? idx : abs;
    }
  } catch {
    /* 忽略 stat 失败 */
  }
  return abs;
}

function gitLastCommitTs(gitPath) {
  try {
    const out = execSync(`git log -1 --format=%ct -- "${gitPath}"`, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    return out ? parseInt(out, 10) : 0;
  } catch {
    return null;
  }
}

function hasGit() {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- ① 可达性 ----------
// 从 docs/README.md 出发做 BFS，沿 README 链接走图。比"同目录 basename 是否被提及"
// 严格：整棵没人链接的子树、以及跨目录断链，都会被抓出来。
function checkReachability() {
  if (!fs.existsSync(docsDir)) {
    warnings.push('docs/ 目录不存在，跳过可达性检查');
    return;
  }
  const allFiles = listMdFiles(docsDir);
  const fileSet = new Set(allFiles.map(f => path.resolve(f)));

  // 目录缺 README 入口：docs/ 下任何直接含 md 的目录都必须有 README.md
  const dirs = new Set(allFiles.map(f => path.dirname(f)));
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(dir, 'README.md'))) {
      issues.reach.push(`${rel(dir)}/ 缺少 README.md 入口`);
    }
  }

  const entry = path.join(docsDir, 'README.md');
  if (!fs.existsSync(entry)) {
    issues.reach.push('docs/README.md 不存在，无法做可达性检查');
    return;
  }

  const start = path.resolve(entry);
  const hops = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    let body;
    try {
      body = extractMarkdownBody(fs.readFileSync(cur, 'utf8'));
    } catch {
      continue;
    }
    for (const target of extractLinks(body)) {
      const abs = resolveLink(cur, target);
      if (!fileSet.has(abs) || hops.has(abs)) continue; // docs/ 之外的目标交给②
      hops.set(abs, hops.get(cur) + 1);
      queue.push(abs);
    }
  }

  for (const f of allFiles) {
    const abs = path.resolve(f);
    if (!hops.has(abs)) {
      issues.reach.push(
        `${rel(f)} 不可达：无法沿 README 链接从 docs/README.md 抵达`
      );
    } else if (hops.get(abs) > 3) {
      warnings.push(`${rel(f)} 跳数 ${hops.get(abs)}，超过 3：索引层级过深`);
    }
  }
}

// ---------- ② 死链 ----------
function checkLinks() {
  const roots = [docsDir, repoRoot];
  const files = new Set();
  for (const r of roots) {
    if (r === repoRoot) {
      for (const name of ['README.md', 'AGENTS.md']) {
        const f = path.join(repoRoot, name);
        if (fs.existsSync(f)) files.add(f);
      }
    } else {
      listMdFiles(r).forEach(f => files.add(f));
    }
  }
  for (const f of files) {
    const content = extractMarkdownBody(fs.readFileSync(f, 'utf8'));
    for (const target of extractLinks(content)) {
      const resolved = path.resolve(path.dirname(f), target);
      if (!fs.existsSync(resolved)) {
        issues.deadlink.push(`${rel(f)} -> ${target} 目标不存在`);
      }
    }
  }
}

// ---------- ③ frontmatter ----------
function checkFrontmatter(allDocs) {
  const today = todayStr();
  for (const f of allDocs) {
    if (isExemptFromFrontmatter(f)) continue;
    const content = fs.readFileSync(f, 'utf8');
    const fm = parseFrontmatter(content);
    const name = path.basename(f);
    const isAdr = ADR_PREFIX.test(name);
    if (!fm) {
      issues.frontmatter.push(`${rel(f)} 缺少 frontmatter`);
      continue;
    }
    const status = (fm.status || '').trim();

    if (!status) {
      issues.frontmatter.push(`${rel(f)} 缺少 status`);
    } else if (isAdr) {
      if (!STATUS_ADR.includes(status)) {
        issues.frontmatter.push(
          `${rel(f)} status="${status}" 非法，ADR 只允许 ${STATUS_ADR.join(' / ')}`
        );
      }
    } else if (!STATUS_LIVING.includes(status)) {
      issues.frontmatter.push(
        `${rel(f)} status="${status}" 非法，只允许 ${STATUS_LIVING.join(' / ')}`
      );
    }

    if (isAdr) continue; // ADR 只要求 status

    const lv = (fm.last_verified || '').trim();
    if (!lv) {
      issues.frontmatter.push(`${rel(f)} 缺少 last_verified`);
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(lv)) {
      issues.frontmatter.push(
        `${rel(f)} last_verified="${lv}" 格式应为 YYYY-MM-DD`
      );
    } else if (lv > today) {
      issues.frontmatter.push(
        `${rel(f)} last_verified="${lv}" 晚于今天 ${today}`
      );
    }

    const scope = (fm.scope || '').trim();
    if (scope && scope !== 'code' && scope !== 'process') {
      issues.frontmatter.push(
        `${rel(f)} scope="${scope}" 非法，只允许 code / process`
      );
    }
    if (
      status === 'living' &&
      !isProcessScoped(fm) &&
      parseCovers(fm.covers).length === 0
    ) {
      issues.frontmatter.push(
        `${rel(f)} status=living 但缺少 covers（无对应代码路径的文档请标注 scope: process）`
      );
    }
  }
}

// ---------- ④ covers 漂移 ----------
// covers 路径存在性不依赖 git，无论有无 git 都检查；时间戳比对需要 git。
function checkDrift(allDocs) {
  const withGit = hasGit();
  if (!withGit)
    warnings.push('当前目录不是 git 仓库，跳过 covers 漂移的时间戳比对');
  for (const f of allDocs) {
    const fm = parseFrontmatter(fs.readFileSync(f, 'utf8'));
    if (!fm) continue;
    if (isExemptFromDrift(f, fm)) continue;
    if (isProcessScoped(fm)) continue;
    const covers = parseCovers(fm.covers);
    if (covers.length === 0) continue;
    const missing = covers.filter(
      c => !fs.existsSync(path.resolve(repoRoot, c))
    );
    for (const c of missing) {
      issues.drift.push(`${rel(f)} covers 路径不存在：${c}`);
    }
    if (!withGit) continue;
    const docTs = gitLastCommitTs(rel(f));
    if (docTs === null || docTs === 0) continue;
    for (const c of covers) {
      if (missing.includes(c)) continue;
      const coverTs = gitLastCommitTs(c);
      if (coverTs === null) continue;
      if (coverTs > docTs) {
        issues.drift.push(
          `${rel(f)} 疑似陈旧：covers 的 ${c} 在文档最后提交之后有变更`
        );
      }
    }
  }
}

// ---------- ⑨ 活文档体积基线 ----------
function checkVolume(allDocs) {
  for (const f of allDocs) {
    const fm = parseFrontmatter(fs.readFileSync(f, 'utf8'));
    if (!fm) continue;
    if (isExemptFromDrift(f, fm)) continue; // 含 snapshot / deprecated / ADR
    if ((fm.status || '').trim() !== 'living') continue;
    const r = rel(f).split('/');
    if (r[0] !== 'docs' || !FACT_LAYERS_SET.includes(r[1])) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).length;
    if (lines > maxDocLines) {
      warnings.push(
        `⑨ ${rel(f)} 共 ${lines} 行（基线 ${maxDocLines}）：事实源应有界，考虑删减`
      );
    }
  }
}

// ---------- ⑥ 终态痕迹 / ⑦ 悬空引用（仅作用于事实源层） ----------
const FACT_LAYERS_SET = [
  'architecture',
  'engineering',
  'product',
  'operations',
  'governance'
];

// 事实源层文档 + 根入口文件；豁免 docs/tasks/ 与 docs/decisions/
function factSourceTargets(allDocs) {
  const targets = allDocs.filter(f => {
    const r = rel(f).split('/');
    return r[0] === 'docs' && FACT_LAYERS_SET.includes(r[1]);
  });
  for (const name of ['AGENTS.md', 'README.md']) {
    const f = path.join(repoRoot, name);
    if (fs.existsSync(f)) targets.push(f);
  }
  return targets;
}

function loadFinalStateRules() {
  const p = path.join(__dirname, 'final-state-rules.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    warnings.push(`⑥ final-state-rules.json 解析失败：${e.message}`);
    return null;
  }
}

// 用 extractMarkdownBody 扫（行内代码已清空）——规则文本里用反引号列举禁用词不会被误报
function checkFinalState(allDocs, ruleSet) {
  if (!ruleSet) {
    warnings.push('⑥ 未找到 final-state-rules.json，跳过终态痕迹检查');
    return;
  }
  const compiled = [];
  for (const r of ruleSet.rules || []) {
    try {
      const flags = (r.flags || '').includes('g')
        ? r.flags
        : `${r.flags || ''}g`;
      compiled.push({ label: r.label, re: new RegExp(r.pattern, flags) });
    } catch (e) {
      warnings.push(`⑥ 规则无法编译（${r.label}）：${e.message}`);
    }
  }
  for (const f of factSourceTargets(allDocs)) {
    const body = extractMarkdownBody(fs.readFileSync(f, 'utf8'));
    for (const { label, re } of compiled) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body)) !== null) {
        const hit = m[0].replace(/\s+/g, ' ').slice(0, 40);
        issues.finalstate.push(`${rel(f)} 终态痕迹[${label}]：${hit}`);
        if (m.index === re.lastIndex) re.lastIndex++; // 防零宽匹配死循环
      }
    }
  }
}

const PATH_LIKE = /^[\w][\w.-]*(?:\/[\w.-]+)*\/?$/;
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|vue|py|go|java|kt|cs|rb|rs|php|json|ya?ml|toml|ini|md|sh|ps1|bat|sql|prisma|proto|tf|env|lock)$/i;
const URL_RE = /https?:\/\/[^\s)\]>`"']+/g;
const ACCESS_RE = /(访问于|访问日期|accessed)[^\n]{0,24}\d{4}-\d{2}-\d{2}/i;
const LOCAL_HOST_RE = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i;

// 只检查以仓库顶层目录开头的路径。
// 原因：monorepo 里文档常按应用相对路径书写（`src/generated/`、`prisma/seed.ts`），
// 拿仓库根去解析会全线误报。限定"顶层目录开头"后判据明确：要么它真在仓库里，要么它
// 压根不是仓库根相对路径（属于对某个子包的描述，交给人工）。这牺牲了一部分检出率，
// 换来可预测——一个满屏误报的检查项，agent 会直接绕过。
function topLevelDirs() {
  try {
    return fs
      .readdirSync(repoRoot, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

function checkDanglingRefs(allDocs) {
  const tops = topLevelDirs();
  for (const f of factSourceTargets(allDocs)) {
    const content = fs.readFileSync(f, 'utf8');
    for (const span of extractInlineCodeSpans(content)) {
      if (span.length > 200 || span.includes(' ') || span.startsWith('--'))
        continue;
      if (!PATH_LIKE.test(span) || !span.includes('/')) continue;
      const head = span.split('/')[0];
      if (!tops.includes(head)) continue; // 非仓库根相对路径，跳过
      if (!CODE_EXT.test(span) && !span.endsWith('/')) continue;
      if (!fs.existsSync(path.resolve(repoRoot, span))) {
        issues.dangling.push(`${rel(f)} 引用了不存在的路径：${span}`);
      }
    }
    const lines = stripFencesAndFrontmatter(content).split(/\r?\n/);
    for (const line of lines) {
      const urls = line.match(URL_RE);
      if (!urls) continue;
      if (ACCESS_RE.test(line)) continue;
      const external = urls.filter(u => !LOCAL_HOST_RE.test(u));
      if (external.length === 0) continue; // 本地地址不是外部事实来源
      warnings.push(
        `⑦ ${rel(f)} 外部链接未标访问日期：${external[0].slice(0, 60)}`
      );
    }
  }
}

// 规则（task-doc-governance）：每个任务目录必须在热或冷索引中登记；收口后可从热索引
// 移除该行，也可"改为指向 archive 的一行摘要"——后者是合法的，所以判据不是"是否出现
// 在热索引"，而是"是否被当作本地目录引用"。归档登记允许用标题或内联代码，不限于链接。
// ---------- ⑧ tasks 索引一致性 ----------
// 规则（task-doc-governance）：每个任务目录必须在热或冷索引中登记；收口后可从热索引
// 移除该行，也可"改为指向 archive 的一行摘要"——后者是合法的，所以判据不是"是否出现
// 在热索引"，而是"是否被当作本地目录引用"。归档登记允许用标题或内联代码，不限于链接。
function checkTasksIndex() {
  const tasksDir = path.join(docsDir, 'tasks');
  if (!fs.existsSync(tasksDir)) return;
  const hotIndex = path.join(tasksDir, 'README.md');
  const coldDir = path.join(tasksDir, 'archive');
  const coldIndex = path.join(coldDir, 'README.md');

  const readDirNames = dir => {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && DATE_PREFIX.test(e.name))
      .map(e => e.name);
  };
  const hotDirs = readDirNames(tasksDir);
  const coldDirs = readDirNames(coldDir);

  const TOKEN_RE = /\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]+/g;
  const norm = t => t.replace(/\.md$/, '');

  // 登记证据：正文任意位置出现的日期前缀词（标题、表格、内联代码都算）
  const registered = indexFile => {
    if (!fs.existsSync(indexFile)) return new Set();
    const raw = fs.readFileSync(indexFile, 'utf8');
    const out = new Set();
    let m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(raw)) !== null) out.add(norm(m[0]));
    return out;
  };
  // "被当作本地目录引用"：链接目标指向 docs/tasks/ 之下、且不经过 archive/
  const localRefs = indexFile => {
    if (!fs.existsSync(indexFile)) return new Set();
    const body = extractMarkdownBody(fs.readFileSync(indexFile, 'utf8'));
    const out = new Set();
    for (const target of extractLinks(body)) {
      const segs = target.split('/');
      if (segs.includes('archive')) continue; // 指向归档的一行摘要，规则明确允许
      for (const seg of segs) {
        if (DATE_PREFIX.test(seg)) out.add(norm(seg));
      }
    }
    return out;
  };

  const hotReg = registered(hotIndex);
  const coldReg = registered(coldIndex);
  const hotLocal = localRefs(hotIndex);

  for (const d of hotDirs) {
    if (!hotReg.has(d)) {
      issues.tasks.push(
        `${d} 在 docs/tasks/ 下但未登记进热索引 ${rel(hotIndex)}`
      );
    }
  }
  for (const d of coldDirs) {
    if (!coldReg.has(d)) {
      issues.tasks.push(`${d} 已归档但未登记进冷索引 ${rel(coldIndex)}`);
    }
  }
  for (const d of hotLocal) {
    if (!hotDirs.includes(d)) {
      issues.tasks.push(
        `${d} 被热索引当作本地任务引用，但 docs/tasks/ 下无此目录（已归档的应写成 archive/ 前缀）`
      );
    }
  }
  const both = hotDirs.filter(d => coldDirs.includes(d));
  for (const d of both) {
    issues.tasks.push(`${d} 同时存在于 docs/tasks/ 与 docs/tasks/archive/`);
  }

  // 热索引"大小恒定"是软约束：行数超阈值提示精简
  if (fs.existsSync(hotIndex)) {
    const lines = fs.readFileSync(hotIndex, 'utf8').split(/\r?\n/);
    const pipeRows = lines.filter(l => /^\s*\|/.test(l)).length;
    const seps = lines.filter(l => /^\s*\|[\s:|-]+\|\s*$/.test(l)).length;
    const dataRows = Math.max(0, pipeRows - 2 * seps); // 每个表各减去表头与分隔行
    if (dataRows > hotIndexRows) {
      warnings.push(
        `⑧ 热索引 ${rel(hotIndex)} 有 ${dataRows} 行数据（阈值 ${hotIndexRows}）：应只列进行中 + 最近已完成`
      );
    }
  }
}

// ---------- ⑤ AGENTS.md 行数 ----------
function checkAgentsBudget() {
  const agentsFile = path.join(repoRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsFile)) {
    warnings.push('未找到 AGENTS.md');
    return;
  }
  const lines = fs.readFileSync(agentsFile, 'utf8').split(/\r?\n/).length;
  if (lines > budget) {
    issues.budget.push(`AGENTS.md 共 ${lines} 行，超出预算 ${budget} 行`);
  }
}

// ---------- 执行 ----------
const allDocs = fs.existsSync(docsDir) ? listMdFiles(docsDir) : [];
checkReachability();
checkLinks();
checkFrontmatter(allDocs);
checkDrift(allDocs);
checkAgentsBudget();
checkFinalState(allDocs, loadFinalStateRules());
checkDanglingRefs(allDocs);
checkTasksIndex();
checkVolume(allDocs);

// ---------- 输出 ----------
const labels = {
  reach: '① 可达性',
  deadlink: '② 死链',
  frontmatter: '③ frontmatter 与字段值',
  drift: '④ covers 漂移与路径',
  budget: '⑤ AGENTS.md 行数',
  finalstate: '⑥ 终态痕迹',
  dangling: '⑦ 悬空引用',
  tasks: '⑧ tasks 索引一致性'
};
let total = 0;
for (const key of Object.keys(labels)) {
  const list = issues[key];
  total += list.length;
  if (list.length > 0) {
    console.log(`\n[FAIL] ${labels[key]}（${list.length} 项）`);
    for (const item of list) console.log(`  - ${item}`);
  } else {
    console.log(`[OK]   ${labels[key]}`);
  }
}
for (const w of warnings) console.log(`[WARN] ${w}`);

if (total === 0) {
  console.log(`\n全绿：共检查 ${allDocs.length} 个 docs 文件，未发现问题。`);
  process.exit(0);
} else {
  console.log(`\n共发现 ${total} 个问题。`);
  process.exit(1);
}
