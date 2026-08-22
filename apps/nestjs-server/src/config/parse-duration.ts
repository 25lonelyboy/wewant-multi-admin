const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400
};

/**
 * 短时长文法解析：数字 + s|m|h|d 后缀 → 秒。
 * 不引入 ms 依赖；非法输入直接抛错（env 校验期快速失败）。
 */
export function parseDurationToSeconds(input: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `非法时长格式: "${input}"（期望形如 90s / 15m / 12h / 7d）`
    );
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]];
}
