// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountWithEP } from '@/test-utils/mount';
import { nextTick } from 'vue';

// ── Mocks ──
const getMineMock = vi.fn();
vi.mock('@/api/user', () => ({
  getMine: (...args: any[]) => getMineMock(...args)
}));

const formUploadMock = vi.fn();
vi.mock('@/api/mock', () => ({
  formUpload: (...args: any[]) => formUploadMock(...args)
}));

vi.mock('@/utils/message', () => ({ message: vi.fn() }));

vi.mock('@pureadmin/utils', () => ({
  deviceDetection: () => false,
  createFormData: (obj: Record<string, any>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(obj)) fd.append(k, v);
    return fd;
  }
}));

// T4 stub：ReCropperPreview 为 canvas 组件，测试环境不可达
vi.mock('@/components/ReCropperPreview', () => ({
  default: {
    name: 'ReCropperPreview',
    template: '<div class="re-cropper-preview-stub" />',
    methods: { hidePopover: vi.fn() }
  }
}));

import Profile from './Profile.vue';
import { message } from '@/utils/message';

describe('Profile.vue（T2 integration）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMine code=0 填充表单字段', async () => {
    getMineMock.mockResolvedValue({
      code: 0,
      data: {
        avatar: 'https://example.com/avatar.png',
        nickname: '测试用户',
        email: 'test@qq.com',
        phone: '13800138000',
        description: '测试简介'
      }
    });

    const wrapper = mountWithEP(Profile);
    // onMounted 异步等待
    await vi.waitFor(() => {
      expect(getMineMock).toHaveBeenCalled();
    });
    await nextTick();

    // 表单 input 应填充数据
    const inputs = wrapper.findAll('input');
    // nickname / email / phone 至少 3 个 el-input
    const inputValues = inputs.map(i => (i.element as HTMLInputElement).value);
    expect(inputValues).toContain('测试用户');
    expect(inputValues).toContain('test@qq.com');
    expect(inputValues).toContain('13800138000');
  });

  it('getMine code!=0 不填充数据', async () => {
    getMineMock.mockResolvedValue({ code: 1, data: null });

    const wrapper = mountWithEP(Profile);
    await vi.waitFor(() => {
      expect(getMineMock).toHaveBeenCalled();
    });
    await nextTick();

    const inputs = wrapper.findAll('input');
    const inputValues = inputs.map(i => (i.element as HTMLInputElement).value);
    // 所有字段应保持初始空串
    expect(inputValues.every(v => v === '')).toBe(true);
  });

  it('queryEmail 有输入时过滤匹配结果', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    const wrapper = mountWithEP(Profile);
    await nextTick();

    // queryEmail 不在 setup expose 中，需通过 el-autocomplete 的 fetch-suggestions 触发
    const autocomplete = wrapper.findComponent({ name: 'ElAutocomplete' });
    expect(autocomplete.exists()).toBe(true);
    const fetchSuggestions = autocomplete.props('fetchSuggestions') as Function;
    const callback = vi.fn();
    fetchSuggestions('test', callback);
    expect(callback).toHaveBeenCalled();
    const results = callback.mock.calls[0][0];
    // 3 个邮箱后缀都会生成，然后过滤以 'test' 开头的
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].value).toContain('test');
  });

  it('queryEmail 空输入返回全部列表', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    const wrapper = mountWithEP(Profile);
    await nextTick();

    const autocomplete = wrapper.findComponent({ name: 'ElAutocomplete' });
    expect(autocomplete.exists()).toBe(true);
    const fetchSuggestions = autocomplete.props('fetchSuggestions') as Function;
    const callback = vi.fn();
    fetchSuggestions('', callback);
    expect(callback).toHaveBeenCalled();
    const results = callback.mock.calls[0][0];
    expect(results.length).toBe(3);
  });

  it('handleSubmitImage code=0 成功分支', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    formUploadMock.mockResolvedValue({ code: 0 });

    const wrapper = mountWithEP(Profile);
    await nextTick();

    // 设置 cropperBlob 模拟裁剪结果
    const vm = wrapper.vm as any;
    vm.cropperBlob = new Blob(['test'], { type: 'image/png' });

    // 模拟 cropRef 和 uploadRef
    vm.cropRef = { hidePopover: vi.fn() };
    vm.uploadRef = { clearFiles: vi.fn() };
    vm.isShow = true;

    await vm.handleSubmitImage();
    await vi.waitFor(() => expect(formUploadMock).toHaveBeenCalled());
    await nextTick();

    expect(message).toHaveBeenCalledWith('更新头像成功', { type: 'success' });
  });

  it('handleSubmitImage code!=0 失败分支', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    formUploadMock.mockResolvedValue({ code: 1 });

    const wrapper = mountWithEP(Profile);
    await nextTick();

    const vm = wrapper.vm as any;
    vm.cropperBlob = new Blob(['test'], { type: 'image/png' });
    vm.cropRef = { hidePopover: vi.fn() };
    vm.uploadRef = { clearFiles: vi.fn() };

    await vm.handleSubmitImage();
    await vi.waitFor(() => expect(formUploadMock).toHaveBeenCalled());
    await nextTick();

    expect(message).toHaveBeenCalledWith('更新头像失败');
  });

  it('handleSubmitImage 异常 catch 分支', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    formUploadMock.mockRejectedValue('network error');

    const wrapper = mountWithEP(Profile);
    await nextTick();

    const vm = wrapper.vm as any;
    vm.cropperBlob = new Blob(['test'], { type: 'image/png' });

    await vm.handleSubmitImage();
    await vi.waitFor(() => expect(formUploadMock).toHaveBeenCalled());
    await nextTick();

    expect(message).toHaveBeenCalledWith(expect.stringContaining('提交异常'), {
      type: 'error'
    });
  });

  it('渲染个人信息表单基本结构', async () => {
    getMineMock.mockResolvedValue({ code: 0, data: { nickname: 'u' } });
    const wrapper = mountWithEP(Profile);
    await nextTick();

    // 标题
    expect(wrapper.find('h3').text()).toBe('个人信息');
    // 表单
    expect(wrapper.find('form').exists()).toBe(true);
    // 更新信息按钮
    const buttons = wrapper.findAll('button');
    const btnTexts = buttons.map(b => b.text());
    expect(btnTexts).toContain('更新信息');
  });
});
