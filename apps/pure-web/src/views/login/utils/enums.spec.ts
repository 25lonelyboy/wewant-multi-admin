// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (m: string) => m
}));

import { operates, thirdParty } from './enums';

describe('login/utils/enums', () => {
  it('operates 有3项（手机/二维码/注册）', () => {
    expect(operates).toHaveLength(3);
    expect(operates[0].title).toBeDefined();
  });

  it('thirdParty 有4项（微信/支付宝/QQ/微博）', () => {
    expect(thirdParty).toHaveLength(4);
    expect(thirdParty[0].icon).toBe('wechat');
  });
});
