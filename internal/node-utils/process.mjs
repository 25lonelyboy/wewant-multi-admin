import { spawn, spawnSync } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

/**
 * Windows shell 模式下，参数含空格/引号时加引号包裹避免拆词。
 * cmd 的完整转义是无底洞，复杂参数请改用文件传参。
 */
function quoteArg(arg) {
  const text = String(arg);
  return /[\s"]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function buildShellCommand(cmd, args) {
  return [cmd, ...args.map(quoteArg)].join(' ');
}

/**
 * 同步执行命令，stdio 透传（inherit）。
 * DEP0190 安全模式：Windows 拼单字符串 + shell；非 Windows 裸参数数组。
 * 非零退出码抛错。
 */
export function runSync(cmd, args = [], opts = {}) {
  const result = IS_WIN
    ? spawnSync(buildShellCommand(cmd, args), {
        stdio: 'inherit',
        shell: true,
        ...opts
      })
    : spawnSync(cmd, args, { stdio: 'inherit', ...opts });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `命令执行失败（exit ${result.status}）：${cmd} ${args.join(' ')}`
    );
  }
  return result;
}

/**
 * 异步执行命令，返回 child 供调用方 kill（如 dev 脚本的优雅退出）。
 */
export function run(cmd, args = [], opts = {}) {
  return IS_WIN
    ? spawn(buildShellCommand(cmd, args), {
        stdio: 'inherit',
        shell: true,
        ...opts
      })
    : spawn(cmd, args, { stdio: 'inherit', ...opts });
}
