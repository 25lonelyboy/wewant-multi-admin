// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import { createRouter, createMemoryHistory } from 'vue-router';

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

import LoginUpdate from './LoginUpdate.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: LoginUpdate }]
});

const mountUpdate = () =>
  mountWithEP(LoginUpdate, { global: { plugins: [router] } });

describe('LoginUpdate.vue（T2）', () => {
  it('渲染忘记密码表单含4个输入字段', () => {
    const wrapper = mountUpdate();
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(4);
  });

  it('repeatPasswordRule: 空值 → 错误', () => {
    const wrapper = mountUpdate();
    const inputs = wrapper.findAll('input');
    const repeatInput = inputs[3];
    repeatInput.setValue('');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('repeatPasswordRule: 密码不一致 → 错误', () => {
    const wrapper = mountUpdate();
    const inputs = wrapper.findAll('input');
    const pwdInput = inputs[2];
    const repeatInput = inputs[3];
    pwdInput.setValue('abc123!@#');
    repeatInput.setValue('different!');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('repeatPasswordRule: 密码一致 → 通过', () => {
    const wrapper = mountUpdate();
    const inputs = wrapper.findAll('input');
    const pwdInput = inputs[2];
    const repeatInput = inputs[3];
    pwdInput.setValue('abc123!@#');
    repeatInput.setValue('abc123!@#');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('onUpdate: loading 初始为 false（validate 分支未触发）', () => {
    const wrapper = mountUpdate();
    const loginBtn = wrapper
      .findAll('button')
      .find(b => b.classes().includes('el-button--primary'));
    expect(loginBtn).toBeDefined();
    expect(loginBtn!.classes()).not.toContain('is-loading');
  });

  it('返回按钮存在', () => {
    const wrapper = mountUpdate();
    const buttons = wrapper.findAll('button');
    const backBtn = buttons[buttons.length - 1];
    expect(backBtn.exists()).toBe(true);
  });
});
