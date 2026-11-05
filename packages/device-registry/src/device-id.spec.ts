import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDeviceId, issueDeviceId } from './device-id.js';

void test('签发的标识满足 16 位、首字母、其余大写字母数字', () => {
  for (let index = 0; index < 200; index += 1) {
    const id = issueDeviceId();
    assert.equal(id.length, 16);
    assert.match(id, /^[A-Z][A-Z0-9]{15}$/);
    assert.equal(checkDeviceId(id), true);
  }
});

void test('签发是随机的：一批里极少重复', () => {
  const ids = new Set(Array.from({ length: 500 }, () => issueDeviceId()));
  assert.ok(ids.size >= 499, `重复过多：${500 - ids.size}`);
});

void test('非法形态被拒：长度、首字符、字符集', () => {
  assert.equal(checkDeviceId('abcdef0123456789'), false);
  assert.equal(checkDeviceId('1BCDEF0123456789'), false);
  assert.equal(checkDeviceId('ABCDEF012345678'), false);
  assert.equal(checkDeviceId('ABCDEF01234567890'), false);
  assert.equal(checkDeviceId('ABCDEF01-3456789'), false);
});
