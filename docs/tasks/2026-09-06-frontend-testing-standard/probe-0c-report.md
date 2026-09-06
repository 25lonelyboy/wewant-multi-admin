# Phase 0c exclude 可行性探针报告（2026-09-06）

- **当前全局聚合**（T4/T5 排除后）：lines 66.75% / branches 59.44%（All files 行）
- **距离 80/80 的差距**：lines 差 13.25pp，branches 差 20.56pp；主要欠覆盖文件 top5（非排除、非纯类型）：
  1. src/layout/components/lay-sidebar/NavVertical.vue — lines 0%
  2. src/layout/components/lay-search/index.vue — lines 0%
  3. src/layout/components/lay-sidebar/components/SidebarFullScreen.vue — lines 0%
  4. src/layout/hooks/useBoolean.ts — lines 0%
  5. src/layout/hooks/useLayout.ts — lines 0%
- **数学假设确认**：非排除文件 per-file 键全绿 ≥80% ⇒ 聚合必 ≥80%（由 Task 6-13 逐步达成）
- **crown-jewel 建议清单**（默认锁定 6，Phase F 采用）：
  1. src/utils/auth.ts（hasAuth/hasPerms 权限判定）
  2. src/store/modules/user.ts（token/session 状态机）
  3. src/utils/http/index.ts（信封解包 + BizCode 40102 刷新拦截）
  4. src/router/guards.ts（Task 9 新建，权限路由守卫）
  5. src/utils/tree.ts（菜单层级核心）
  6. src/store/modules/permission.ts（动态路由授权）
