// seed 纯函数单测（位置裁决：prisma/ 在 jest rootDir=src 之外，
// spec 放 src/database/ 下，import 相对路径指向 ../../prisma/）
import { MENU_TREE } from '../../prisma/seed-data.js';
import { buildButtonSeeds, flattenMenus } from '../../prisma/seed.js';

describe('seed 纯函数', () => {
  it('菜单树展平为 10 个 MENU 节点且父子关系正确', () => {
    const flat = flattenMenus(MENU_TREE);
    expect(flat).toHaveLength(10);
    const user = flat.find(m => m.name === 'SystemUser');
    expect(user?.parentName).toBe('System');
  });

  it('按钮权限点 = 4 页 × 4 动作 = 16 个，命名 system:<page>:<action>', () => {
    const buttons = buildButtonSeeds(MENU_TREE);
    expect(buttons).toHaveLength(16);
    const names = buttons.map(b => b.permission);
    expect(names).toContain('system:user:add');
    expect(names).toContain('system:dept:delete');
    expect(new Set(names).size).toBe(16);
  });
});
