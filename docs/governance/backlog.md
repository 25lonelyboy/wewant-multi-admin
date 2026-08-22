---
status: living
last_verified: 2026-08-23
---

# 全局 backlog

各任务域识别但未处置关闭的登记项。每行含来源、结论与重新触发条件；关闭时在行尾追加「（已关闭，YYYY-MM-DD）」标注，不删行。

| 项 | 背景与触发条件 |
|---|---|
| 子资源替换并发窗口 | 角色-菜单 / 用户-角色分配当前用多次单行 SQL 而非事务原子操作，高并发管理场景下可能产生不一致；触发：真实多管理员并发操作场景出现 |
| e2e 套件级临时数据清理 | 当前以 `global-teardown` 全表 TRUNCATE 兜底；触发：兜底失效或套件间数据污染复现 |
| 高级密码策略 | argon2id 成本参数目前是强度底线，无复杂度 / 历史密码检查；触发：多用户 / 多端真实接入场景出现 |
| restore 端点 / 超管标志位化 / 单测覆盖率下限棘轮 / 防环 DB 层加固 | 已识别未实施；触发：相应主题立项时逐项处置 |
| dept / 监控域后端实现 | 前端 views / api / mock 已就位并降级空态，后端未实现；触发：两域业务需求立项（届时 seed 菜单树恢复节点） |
| mine-logs 个人安全日志 | `/api/v1/mine-logs` 仅 mock 供数，后端未实现；触发：监控域登录日志立项时统一设计 SecurityLog 数据源 |
| 头像上传与文件存储 | `avatar` 目前为字符串字段（URL 或 null），无上传端点；触发：文件存储基建（本地盘 / 对象存储 + 上传端点）引入时 |
| electron-desktop prebuild 构建链 | `prebuild` 直接调 pure-web build 但未先构建 contracts 包，干净工作区首次 `build:desktop` 会因 `dist/` 不存在而断链；触发：electron-desktop 构建链路改造或 contracts 第二个消费者出现时补 `prebuild` 钩子 |
| contracts 包缺 lint / format 脚本 | `packages/contracts` 仅有 build / typecheck / test，无独立 lint 与 format 校验；触发：contracts 消费者增至 2 个以上时补齐 |
