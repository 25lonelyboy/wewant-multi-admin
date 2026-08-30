// vitest alias stub：`~icons/*`（组件形态）与 `*.svg?component` 的统一替身
// （见 vitest.config.ts alias 数组）。组件测试断言组件自身行为，图标渲染无断言价值。
// 必须导出组件而非字符串：RePureTableBar 将 svg?component 导入用作 JSX 标签，
// 字符串标签会以 '<svg></svg>' 进 document.createElement 抛 InvalidCharacterError。
import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'SvgIconStub',
  render: () => h('svg')
});
