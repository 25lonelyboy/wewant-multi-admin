// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));

import { ElMessage } from 'element-plus';
import { message, closeAllMessage } from './message';

const ElMessageMock = ElMessage as unknown as ReturnType<typeof vi.fn> & {
  closeAll: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  ElMessageMock.mockClear();
  ElMessageMock.closeAll.mockClear();
});

describe('message', () => {
  it('无参数对象时走缺省样式', () => {
    message('hi');
    expect(ElMessageMock).toHaveBeenCalledWith({
      message: 'hi',
      customClass: 'pure-message'
    });
  });

  it('参数透传与 antd 风格映射 pure-message', () => {
    message('err', { type: 'error', duration: 5000 });
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        duration: 5000,
        customClass: 'pure-message'
      })
    );
  });

  it('customClass=el 时不加 pure-message', () => {
    message('x', { customClass: 'el' });
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ customClass: '' })
    );
  });
});

describe('closeAllMessage', () => {
  it('调用 ElMessage.closeAll', () => {
    closeAllMessage();
    expect(ElMessageMock.closeAll).toHaveBeenCalledTimes(1);
  });
});
