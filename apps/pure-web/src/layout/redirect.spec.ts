// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

const replaceSpy = vi.fn();
const mockRoute = vi.hoisted(() => ({
  params: { path: 'system/users' },
  query: { id: '1' }
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: mockRoute,
    replace: replaceSpy
  })
}));

import Redirect from './redirect.vue';

describe('Redirect', () => {
  it('calls replace with correct path', () => {
    shallowMount(Redirect as any);
    expect(replaceSpy).toHaveBeenCalledWith({
      path: '/system/users',
      query: { id: '1' }
    });
  });

  it('handles array path param', () => {
    replaceSpy.mockClear();
    mockRoute.params = { path: ['system', 'users', 'detail'] } as any;
    shallowMount(Redirect as any);
    expect(replaceSpy).toHaveBeenCalledWith({
      path: '/system/users/detail',
      query: { id: '1' }
    });
  });

  it('renders empty div', () => {
    const wrapper = shallowMount(Redirect as any);
    expect(wrapper.find('div').exists()).toBe(true);
  });
});
