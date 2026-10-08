#!/usr/bin/env bash
# taosdump 备份 / 恢复往返探针：核实「滚动归档 + 恢复演练」这条运维路径上，文档说不清的几条。
#
# 回答增量 2 决策卡第 4 项里与备份有关的几条：
#   A 备份 / 恢复往返是否成立（数据 + 超表 + 流）
#   B `-S` / `-E` 时间范围能否做滚动归档
#   C `-M ext-meta` 是否备份流定义
#   D `-W` 改名恢复时，流跟不跟着走到新库
#   E `-S` / `-E` 出现在恢复侧是什么行为
#   F `-M` 在备份侧与恢复侧不一致时会怎样（静默跳过还是报错）
#
# 用法：
#   bash scripts/probe/taosdump-roundtrip.sh          # 起容器 + 跑探针
#   bash scripts/probe/taosdump-roundtrip.sh --down   # 停掉探针容器
#
# 容器与 tdengine-container.sh 共用（同名 td-probe、同样只绑宿主回环）。
# ⚠️ 探针内容全部在容器内执行、且不向容器传路径参数：从 Git Bash 直接
#    `docker exec <容器> taosdump ... -i /tmp/x` 会把 /tmp/x 改写成 Windows 路径，
#    taosdump 报 "open backup dir failed"。

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="${TD_PROBE_NAME:-td-probe}"

log() { printf '%s\n' "$*"; }
die() {
  log "✖ $*"
  exit 1
}

command -v docker >/dev/null 2>&1 || die "未找到 docker，请先启动 Docker Desktop"

if [ "${1:-}" = "--down" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 && log "已移除容器 $NAME" || log "容器 $NAME 不存在"
  exit 0
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null)" != "true" ]; then
  log "▶ 容器未运行，先起一个"
  bash "$HERE/tdengine-container.sh" --no-probe || die "容器启动失败"
fi
log "▶ 复用容器 $NAME"

docker exec -i "$NAME" sh -s <<'CONTAINER_SCRIPT'
set -u
DB=probe_dump
REN=probe_ren
DIR=/tmp/taosdump-probe
CD="-h 127.0.0.1 --password=taosdata"

# 取值一律走 REST（taos CLI 的输出带 CRLF，解析易错）
rq() { curl -sS -X POST -H 'Authorization: Basic cm9vdDp0YW9zZGF0YQ==' --data-raw "$1" http://127.0.0.1:6041/rest/sql; }
# 取结果集第一行第一列
first() { rq "$1" | grep -oE '"data":\[\[[^]]*\]\]' | sed 's/"data":\[\[//;s/\]\]//;s/"//g' | cut -d, -f1; }
# 结果集里出现某名字几次
hits() { rq "$1" | grep -oE '"data":\[\[.*\]\]' | grep -o "$2" | wc -l | tr -d ' '; }
say() { printf '    %-10s %s\n' "$1" "$2"; }

echo
echo "===== 0 · 造测试库（3 个子表跨 6/7/8 月 + 一个流）====="
rm -rf "$DIR"
rq "DROP DATABASE IF EXISTS $DB" >/dev/null
rq "CREATE DATABASE $DB PRECISION 'ms' KEEP 1095 DURATION 10" >/dev/null
rq "CREATE STABLE $DB.src (ts timestamp, v float) TAGS (loc varchar(32))" >/dev/null
rq "INSERT INTO $DB.d1 USING $DB.src TAGS('A') VALUES ('2026-06-15 10:00:00', 1.0) ('2026-07-15 10:00:00', 2.0) ('2026-08-15 10:00:00', 3.0)" >/dev/null
rq "INSERT INTO $DB.d2 USING $DB.src TAGS('B') VALUES ('2026-06-16 11:00:00', 4.0) ('2026-07-16 11:00:00', 5.0) ('2026-08-16 11:00:00', 6.0)" >/dev/null
rq "INSERT INTO $DB.d3 USING $DB.src TAGS('C') VALUES ('2026-07-20 12:00:00', 7.0)" >/dev/null
rq "CREATE STREAM $DB.s_down PERIOD(1h) FROM $DB.src INTO $DB.o_down AS SELECT _wstart AS ts, AVG(v) AS v_avg FROM $DB.src PARTITION BY tbname INTERVAL(1h)" >/dev/null
say "数据行数" "$(first "SELECT COUNT(*) FROM $DB.src")"
say "流" "$(first "SHOW $DB.STREAMS")"

echo
echo "===== A · 全量备份（-M all）====="
taosdump $CD -M all -D "$DB" -o "$DIR/all" 2>&1 | grep -E 'Result|Super Tables|Child Tables|Total Rows|Ext Meta' | sed 's/^/    /'
echo "    备份目录内容："
(cd "$DIR/all/$DB" && ls -1 | sed 's/^/      /')

echo
echo "===== B · 时间范围备份（-S/-E，仅 2026-07）====="
taosdump $CD -S '2026-07-01T00:00:00.000+0000' -E '2026-08-01T00:00:00.000+0000' -D "$DB" -o "$DIR/jul" 2>&1 \
  | grep -E 'Result|Total Rows' | sed 's/^/    /'

echo
echo "===== C · -M ext-meta 是否含流定义 ====="
taosdump $CD -M ext-meta -D "$DB" -o "$DIR/ext" 2>&1 | grep -E 'Result|Ext Meta' | sed 's/^/    /'
if [ -f "$DIR/ext/$DB/stream.sql" ]; then
  echo "    stream.sql："
  sed 's/^/      /' "$DIR/ext/$DB/stream.sql"
else
  echo "    ✖ 未见 stream.sql"
fi

echo
echo "===== D · 删库后用 -M all 改名恢复到旁路库 ====="
rq "DROP DATABASE IF EXISTS $DB" >/dev/null
rq "DROP DATABASE IF EXISTS $REN" >/dev/null
taosdump $CD -M all -W "$DB->$REN" -i "$DIR/all" 2>&1 | grep -E 'Content|Result|Total Rows|Ext Meta' | sed 's/^/    /'
say "数据行数" "$(first "SELECT COUNT(*) FROM $REN.src")"
say "超表" "$(first "SHOW $REN.STABLES")"
say "流" "$(first "SHOW $REN.STREAMS")"

echo
echo "===== E · -S/-E 出现在恢复侧 ====="
taosdump $CD -i "$DIR/all" -S '2026-08-01T00:00:00.000+0000' -E '2026-09-01T00:00:00.000+0000' 2>&1 | grep -iE 'error' | head -2 | sed 's/^/    /'

echo
echo "===== F · 备份用 -M all、恢复不带 -M（两侧不一致）====="
rq "DROP DATABASE IF EXISTS $DB" >/dev/null
taosdump $CD -i "$DIR/all" 2>&1 | grep -E 'Content|Result|Total Rows' | sed 's/^/    /'
say "恢复后流" "$(hits "SHOW $DB.STREAMS" s_down) 个（0 = 流没回来，而 Result 仍是 SUCCESS）"

echo
echo "==========================================================="
echo "  归档留在容器 $DIR；复核：docker exec -it td-probe sh"
CONTAINER_SCRIPT

STATUS=$?
log ""
log "▶ 容器 $NAME 保留供人工复核（taos CLI：docker exec -it $NAME taos）"
log "  停掉并删除：bash scripts/probe/taosdump-roundtrip.sh --down"
exit $STATUS
