#!/usr/bin/env node
/**
 * doc-lint.js — 文档治理校验脚本（project-doc-governance 技能配套工具）
 *
 * 母版：project-doc-governance 技能 scripts/doc-lint.js。
 * 仓库副本：初始化/重组时复制到 <repo>/scripts/doc-lint.js 并登记 AGENTS.md；
 * 副本版本落后于母版时（--version 比对），随重组更新。
 *
 * 用法：node doc-lint.js <仓库根目录> [--budget 150] [--version]
 * --version：输出版本号，用于仓库副本与技能母版版本比对。
 *
 * 检查项：
 *   ① 孤儿文件：docs/ 各目录内的 md 文件必须被本级 README.md 索引
 *   ② 死链：docs/ 与根入口文件内的相对 md 链接必须有效
 *   ③ frontmatter：活文档必须有 status / last_verified（living 还需 covers）
 *   ④ covers 漂移：covers 覆盖代码的最后提交晚于文档最后提交 → 疑似陈旧（需 git）
 *   ⑤ AGENTS.md 行数预算：默认 ≤150 行，可用 --budget 覆盖
 *
 * 退出码：0 = 全绿或 --version 查询成功；1 = 存在问题或目录不存在。
 * 豁免：README.md、日期前缀文件（YYYY-MM-DD-*）、docs/tasks/ 下的过程文件
 *       不参与检查③；ADR-* 文件只要求 status 字段。
 */
'use strict';

const VERSION = '1.1.0';

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
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--budget' && args[i + 1]) {
    budget = parseInt(args[i + 1], 10);
    i++;
  } else if (!args[i].startsWith('--')) {
    repoRoot = path.resolve(args[i]);
  }
}
if (!fs.existsSync(repoRoot)) {
  console.error(`错误：目录不存在 ${repoRoot}`);
  process.exit(1);
}

const docsDir = path.join(repoRoot, 'docs');
const issues = {
  orphan: [],
  deadlink: [],
  frontmatter: [],
  drift: [],
  budget: []
};
const warnings = [];

// ---------- 工具函数 ----------
function listMdFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
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

function isExemptFromFrontmatter(file) {
  const name = path.basename(file);
  if (name.toLowerCase() === 'readme.md') return true;
  if (DATE_PREFIX.test(name)) return true; // 不可变过程记录
  const r = rel(file).split('/');
  if (r[0] === 'docs' && r[1] === 'tasks') return true; // 过程材料
  return false;
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

// ---------- Markdown 预处理（检查①②共用，产出纯正文） ----------
function blankNonNewline(s) {
  return s.replace(/[^\r\n]/g, ' ');
}

function extractMarkdownBody(content) {
  let text = content;
  // 顺序依赖：先剥离围栏（否则代码块内未闭合 <!-- 或反引号会干扰后续正则）；
  // 1) frontmatter 首块置空（保留行结构）
  const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (fm) text = blankNonNewline(fm[0]) + text.slice(fm[0].length);

  // 2) 围栏代码块状态机：``` / ~~~，围栏行与内容整体置空
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
  text = out.join('\n');

  // 3) HTML 注释置空（可跨行）
  text = text.replace(/<!--[\s\S]*?-->/g, blankNonNewline);

  // 4) 行内代码 span 置空（先双反引号后单反引号）
  text = text.replace(/``[\s\S]*?``/g, blankNonNewline);
  text = text.replace(/`[^`\r\n]*`/g, blankNonNewline);

  // 已知限制（有意取舍，见设计文档"不做的事"）：
  // - 4 空格缩进代码块不置空：会误伤嵌套列表中的链接索引。
  // - 双反引号跨行 span 可能配对错误：后果为漏报而非误报。
  // - 行内代码 span 内的 `<!--` 可能被 HTML 注释正则在先匹配：同类风险，后果为漏报。

  return text;
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

// ---------- ① 孤儿文件 ----------
function checkOrphans() {
  if (!fs.existsSync(docsDir)) {
    warnings.push('docs/ 目录不存在，跳过孤儿文件检查');
    return;
  }
  // 按目录分组
  const byDir = new Map();
  for (const f of listMdFiles(docsDir)) {
    const dir = path.dirname(f);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const [dir, files] of byDir) {
    const readme = files.find(
      f => path.basename(f).toLowerCase() === 'readme.md'
    );
    // 从 README 纯正文提取链接目标 basename 集合，精确相等比较
    const indexed = new Set();
    if (readme) {
      const body = extractMarkdownBody(fs.readFileSync(readme, 'utf8'));
      let m;
      linkRe.lastIndex = 0;
      while ((m = linkRe.exec(body)) !== null) {
        let target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        target = target.split('#')[0];
        if (!target) continue;
        try {
          target = decodeURIComponent(target);
        } catch {
          /* 保持原样 */
        }
        indexed.add(path.basename(target).toLowerCase());
      }
    }
    if (!readme) {
      // 无 README 时根因是缺少入口，不需要逐文件报"未被索引"
      issues.orphan.push(`${rel(dir)}/ 缺少 README.md 入口`);
      continue;
    }
    for (const f of files) {
      const name = path.basename(f);
      if (name.toLowerCase() === 'readme.md') continue;
      if (!indexed.has(name.toLowerCase())) {
        issues.orphan.push(
          `${rel(f)} 未被 ${rel(path.join(dir, 'README.md'))} 索引`
        );
      }
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
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const f of files) {
    const content = extractMarkdownBody(fs.readFileSync(f, 'utf8'));
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      let target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0];
      if (!target) continue;
      const resolved = path.resolve(
        path.dirname(f),
        decodeURIComponent(target)
      );
      if (!fs.existsSync(resolved)) {
        issues.deadlink.push(`${rel(f)} -> ${m[1]} 目标不存在`);
      }
    }
  }
}

// ---------- ③ frontmatter ----------
function checkFrontmatter(allDocs) {
  for (const f of allDocs) {
    if (isExemptFromFrontmatter(f)) continue;
    const content = fs.readFileSync(f, 'utf8');
    const fm = parseFrontmatter(content);
    const name = path.basename(f);
    if (!fm) {
      issues.frontmatter.push(`${rel(f)} 缺少 frontmatter`);
      continue;
    }
    if (ADR_PREFIX.test(name)) {
      if (!fm.status) issues.frontmatter.push(`${rel(f)} ADR 缺少 status 字段`);
      continue;
    }
    if (!fm.status) issues.frontmatter.push(`${rel(f)} 缺少 status`);
    if (!fm.last_verified)
      issues.frontmatter.push(`${rel(f)} 缺少 last_verified`);
    if (fm.status === 'living' && parseCovers(fm.covers).length === 0) {
      issues.frontmatter.push(`${rel(f)} status=living 但缺少 covers`);
    }
  }
}

// ---------- ④ covers 漂移 ----------
function checkDrift(allDocs) {
  if (!hasGit()) {
    warnings.push('当前目录不是 git 仓库，跳过 covers 漂移检测');
    return;
  }
  for (const f of allDocs) {
    if (isExemptFromFrontmatter(f)) continue;
    const fm = parseFrontmatter(fs.readFileSync(f, 'utf8'));
    if (!fm) continue;
    const covers = parseCovers(fm.covers);
    if (covers.length === 0) continue;
    const docTs = gitLastCommitTs(rel(f));
    if (docTs === null || docTs === 0) continue;
    for (const c of covers) {
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
checkOrphans();
checkLinks();
checkFrontmatter(allDocs);
checkDrift(allDocs);
checkAgentsBudget();

// ---------- 输出 ----------
const labels = {
  orphan: '① 孤儿文件',
  deadlink: '② 死链',
  frontmatter: '③ frontmatter 缺失',
  drift: '④ covers 漂移（疑似陈旧）',
  budget: '⑤ AGENTS.md 行数'
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
