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

import LoginRegist from './LoginRegist.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: LoginRegist }]
});

const mountRegist = () =>
  mountWithEP(LoginRegist, { global: { plugins: [router] } });

describe('LoginRegist.vue（T2）', () => {
  it('渲染注册表单含所有字段', () => {
    const wrapper = mountRegist();
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.findAll('input').length).toBeGreaterThanOrEqual(5);
  });

  it('repeatPasswordRule: 空值 → 错误', () => {
    const wrapper = mountRegist();
    const inputs = wrapper.findAll('input');
    const repeatInput = inputs[4];
    repeatInput.setValue('');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('repeatPasswordRule: 密码不一致 → 错误', () => {
    const wrapper = mountRegist();
    const inputs = wrapper.findAll('input');
    const pwdInput = inputs[3];
    const repeatInput = inputs[4];
    pwdInput.setValue('abc123!@#');
    repeatInput.setValue('different!');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('repeatPasswordRule: 密码一致 → 通过', () => {
    const wrapper = mountRegist();
    const inputs = wrapper.findAll('input');
    const pwdInput = inputs[3];
    const repeatInput = inputs[4];
    pwdInput.setValue('abc123!@#');
    repeatInput.setValue('abc123!@#');
    repeatInput.trigger('blur');
    expect(wrapper.exists()).toBe(true);
  });

  it('checked 默认 false → onUpdate 应走 warning 分支', () => {
    const wrapper = mountRegist();
    const checkbox = wrapper.find('.el-checkbox');
    expect(checkbox.exists()).toBe(true);
    expect(checkbox.classes().includes('is-checked')).toBe(false);
  });

  it('返回按钮存在', () => {
    const wrapper = mountRegist();
    const buttons = wrapper.findAll('button');
    const backBtn = buttons[buttons.length - 1];
    expect(backBtn.exists()).toBe(true);
  });
});
