// vitest alias stub：`~icons/*?raw` 的统一替身（见 vitest.config.ts alias 数组）。
// 消费方仅 offlineIcon.ts——将本字符串交给 getSvgInfo（DOMParser 解析），
// 实测 '<svg></svg>' 返回 { width: 0, height: 0, body: '' }，addIcon 登记占位条目无副作用。
export default '<svg></svg>';
