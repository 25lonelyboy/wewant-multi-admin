import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:8848')
});

export type Env = z.infer<typeof envSchema>;

/**
 * 供 @nestjs/config 的 validate 选项使用：校验失败直接抛出，启动即崩、快速暴露部署问题。
 * 后续阶段在此追加 DATABASE_URL（P2）、JWT_*（P3）等必填项。
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败:\n${details}`);
  }
  return parsed.data;
}
