// @ts-check

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  // Merge 提交不走规范校验
  ignores: [commit => commit.startsWith('Merge')],
  rules: {
    // 强制携带 scope：feat(server): xxx / fix(mobile): xxx
    'scope-empty': [2, 'never'],
    // scope 白名单与仓库结构对应：
    // server=nestjs-server、mobile=uni-mobile、web=pure-web、desktop=electron-desktop、
    // common=packages/common、internal=internal/*、repo=根工程、deps=依赖升级、release=发版、docs=文档
    'scope-enum': [
      2,
      'always',
      [
        'server',
        'mobile',
        'web',
        'desktop',
        'common',
        'internal',
        'repo',
        'deps',
        'release',
        'docs'
      ]
    ]
  }
};
