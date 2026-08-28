/** 登录失败锁定固定参数（设计决策 D6：不进 env，需要调整时再提升） */
export const MAX_ATTEMPTS = 5;
/** 锁定时长（秒）：15 分钟，自然过期即自动解锁 */
export const LOCK_TTL_SECONDS = 900;
/** 失败计数窗口（秒）：10 分钟，窗口从首次失败起算（TTL 只设一次） */
export const FAIL_WINDOW_SECONDS = 600;
