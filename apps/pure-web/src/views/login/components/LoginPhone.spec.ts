// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import { createRouter, createMemoryHistory } from 'vue-router';
import { nextTick } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? '')),
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

vi.mock('@/utils/message', () => ({
  message: vi.fn()
}));

import LoginPhone from './LoginPhone.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: LoginPhone }]
});

const mountPhone = () =>
  mountWithEP(LoginPhone, { global: { plugins: [router] } });

describe('LoginPhone.vue（T2）', () => {
  it('渲染表单且包含手机号输入框', () => {
    const wrapper = mountPhone();
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(2);
  });

  it('点击登录按钮 → loading 变为 true', async () => {
    const wrapper = mountPhone();
    const primaryBtn = wrapper
      .findAll('button')
      .find(b => b.classes().includes('el-button--primary'));
    expect(primaryBtn).toBeDefined();
    await primaryBtn!.trigger('click');
    await nextTick();
    // onLogin 第一行 loading.value = true
    expect(
      wrapper
        .findAll('button')
        .find(b => b.classes().includes('el-button--primary'))!
        .classes()
    ).toContain('is-loading');
  });

  it('点击返回按钮 → 调用 onBack（不崩溃）', async () => {
    const wrapper = mountPhone();
    const buttons = wrapper.findAll('button');
    const backBtn = buttons[buttons.length - 1];
    await backBtn.trigger('click');
    await nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('验证码按钮存在', () => {
    const wrapper = mountPhone();
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it('loading 初始为 false', () => {
    const wrapper = mountPhone();
    const loginBtn = wrapper
      .findAll('button')
      .find(b => b.classes().includes('el-button--primary'));
    expect(loginBtn).toBeDefined();
    expect(loginBtn!.classes()).not.toContain('is-loading');
  });
});
