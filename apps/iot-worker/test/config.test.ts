import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

void test('降采样默认开启，K 默认 3', () => {
  const config = loadConfig({});
  assert.equal(config.downsampleEnabled, true);
  assert.equal(config.downsampleLookbackWindows, 3);
});

void test('⭐ DOWNSAMPLE_ENABLED=false 真的关掉（不是被 z.coerce.boolean 误读）', () => {
  assert.equal(
    loadConfig({ DOWNSAMPLE_ENABLED: 'false' }).downsampleEnabled,
    false
  );
  assert.equal(
    loadConfig({ DOWNSAMPLE_ENABLED: '0' }).downsampleEnabled,
    false
  );
  assert.equal(
    loadConfig({ DOWNSAMPLE_ENABLED: 'true' }).downsampleEnabled,
    true
  );
  assert.equal(loadConfig({ DOWNSAMPLE_ENABLED: '1' }).downsampleEnabled, true);
  assert.equal(
    loadConfig({ DOWNSAMPLE_ENABLED: 'FALSE' }).downsampleEnabled,
    false
  );
});

void test('DOWNSAMPLE_ENABLED 非布尔值 ⇒ 启动即失败', () => {
  assert.throws(() => loadConfig({ DOWNSAMPLE_ENABLED: 'yes' }), /布尔值/);
});

void test('K 必须为正整数', () => {
  assert.equal(
    loadConfig({ DOWNSAMPLE_LOOKBACK_WINDOWS: '5' }).downsampleLookbackWindows,
    5
  );
  assert.throws(() => loadConfig({ DOWNSAMPLE_LOOKBACK_WINDOWS: '0' }));
  assert.throws(() => loadConfig({ DOWNSAMPLE_LOOKBACK_WINDOWS: '-1' }));
});

void test('⭐ INGEST_BATCH_SIZE 超过单次 bind 上限 32767 ⇒ 启动即失败（行 2）', () => {
  assert.equal(
    loadConfig({ INGEST_BATCH_SIZE: '32767' }).ingestBatchSize,
    32767
  );
  // 配到 32768 会在写入时抛 `bind number out of range`——必须在启动时就挡下
  assert.throws(() => loadConfig({ INGEST_BATCH_SIZE: '32768' }), /32767/);
});

void test('⭐ 连接数可配 2~4，默认 2（行 1）', () => {
  assert.equal(loadConfig({}).tdengineConnections, 2);
  assert.equal(
    loadConfig({ TDENGINE_CONNECTIONS: '4' }).tdengineConnections,
    4
  );
  assert.throws(() => loadConfig({ TDENGINE_CONNECTIONS: '1' }));
  assert.throws(() => loadConfig({ TDENGINE_CONNECTIONS: '5' }));
});
