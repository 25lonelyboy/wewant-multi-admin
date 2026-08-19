/**
 * 超管标识：来源为 seed 内置数据（prisma/seed.ts 的 admin 用户、
 * prisma/seed-data.ts ROLES 的 admin 角色）。集中定义防字面量散落；
 * 未来升级 isSystem 标志位时只改此处（分设计 §12 backlog）。
 */
export const ADMIN_USERNAME = 'admin';
export const ADMIN_ROLE_CODE = 'admin';
