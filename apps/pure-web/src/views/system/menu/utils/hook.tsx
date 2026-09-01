import editForm from '../form.vue';
import { message } from '@/utils/message';
import { transformI18n } from '@/plugins/i18n';
import { addDialog } from '@/components/ReDialog';
import { reactive, ref, onMounted, h } from 'vue';
import type { FormItemProps } from '../utils/types';
import { useRenderIcon } from '@/components/ReIcon/src/hooks';
import { cloneDeep, isAllEmpty, deviceDetection } from '@pureadmin/utils';
import { createMenu, deleteMenu, getMenuList, updateMenu } from '@/api/system';
import type {
  CreateMenuRequest,
  EntityId,
  MenuMeta,
  MenuTypeValue,
  MenuVO,
  UpdateMenuRequest
} from '@multi-admin/contracts';

/** 契约枚举 ↔ 表单数字：后端枚举为事实源，数字仅表单内部形态 */
const MENU_TYPE_TO_NUM: Record<MenuTypeValue, number> = {
  MENU: 0,
  IFRAME: 1,
  EXTERNAL: 2,
  BUTTON: 3
};
const NUM_TO_MENU_TYPE: Record<number, MenuTypeValue> = {
  0: 'MENU',
  1: 'IFRAME',
  2: 'EXTERNAL',
  3: 'BUTTON'
};

/** MenuVO 树 → 表单/展示行（meta 展开、visible→showLink、permission→auths） */
function toDisplayRows(nodes: MenuVO[]): any[] {
  return nodes.map(node => ({
    id: node.id,
    parentId: node.parentId ?? '',
    menuType: MENU_TYPE_TO_NUM[node.type],
    title: node.title,
    name: node.name,
    icon: node.icon ?? '',
    path: node.path ?? '',
    component: node.component ?? '',
    auths: node.permission ?? '',
    sort: node.sort,
    showLink: node.visible ? 1 : 0,
    redirect: node.meta?.redirect ?? '',
    extraIcon: node.meta?.extraIcon ?? '',
    enterTransition: node.meta?.enterTransition ?? '',
    leaveTransition: node.meta?.leaveTransition ?? '',
    activePath: node.meta?.activePath ?? '',
    frameSrc: node.meta?.frameSrc ?? '',
    frameLoading: (node.meta?.frameLoading ?? true) ? 1 : 0,
    keepAlive: (node.meta?.keepAlive ?? false) ? 1 : 0,
    hiddenTag: (node.meta?.hiddenTag ?? false) ? 1 : 0,
    fixedTag: (node.meta?.fixedTag ?? false) ? 1 : 0,
    showParent: (node.meta?.showParent ?? false) ? 1 : 0,
    children: toDisplayRows(node.children)
  }));
}

/** 树过滤：自身或任一子孙命中即保留（保持嵌套结构） */
function filterMenuTree(rows: any[], keyword: string): any[] {
  return rows.reduce<any[]>((acc, row) => {
    const children = filterMenuTree(row.children ?? [], keyword);
    if (transformI18n(row.title).includes(keyword) || children.length) {
      acc.push({ ...row, children });
    }
    return acc;
  }, []);
}

export function useMenu() {
  const form = reactive({
    title: ''
  });

  const formRef = ref();
  const dataList = ref<any[]>([]);
  const loading = ref(true);

  const getMenuType = (type: number, text = false) => {
    switch (type) {
      case 0:
        return text ? '菜单' : 'primary';
      case 1:
        return text ? 'iframe' : 'warning';
      case 2:
        return text ? '外链' : 'danger';
      case 3:
        return text ? '按钮' : 'info';
      default:
        return text ? '' : '';
    }
  };

  const columns: TableColumnList = [
    {
      label: '菜单名称',
      prop: 'title',
      align: 'left',
      cellRenderer: ({ row }) => (
        <>
          <span class="inline-block mr-1">
            {h(useRenderIcon(row.icon), {
              style: { paddingTop: '1px' }
            })}
          </span>
          <span>{transformI18n(row.title)}</span>
        </>
      )
    },
    {
      label: '菜单类型',
      prop: 'menuType',
      width: 100,
      cellRenderer: ({ row, props }) => (
        <el-tag
          size={props.size}
          type={getMenuType(row.menuType) as any}
          effect="plain"
        >
          {getMenuType(row.menuType, true)}
        </el-tag>
      )
    },
    {
      label: '路由路径',
      prop: 'path'
    },
    {
      label: '组件路径',
      prop: 'component',
      formatter: ({ path, component }) =>
        isAllEmpty(component) ? path : component
    },
    {
      label: '权限标识',
      prop: 'auths'
    },
    {
      label: '排序',
      prop: 'sort',
      width: 100
    },
    {
      label: '隐藏',
      prop: 'showLink',
      formatter: ({ showLink }) => (showLink ? '否' : '是'),
      width: 100
    },
    {
      label: '操作',
      fixed: 'right',
      width: 210,
      slot: 'operation'
    }
  ];

  function handleSelectionChange(_val: unknown) {
    console.log('handleSelectionChange', _val);
  }

  function resetForm(formEl: any) {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  }

  async function onSearch() {
    loading.value = true;
    const { code, data } = await getMenuList();
    if (code === 0) {
      const rows = toDisplayRows(data);
      dataList.value = isAllEmpty(form.title)
        ? rows
        : filterMenuTree(rows, form.title);
    }
    loading.value = false;
  }

  function formatHigherMenuOptions(treeList: any[]) {
    if (!treeList || !treeList.length) return;
    const newTreeList = [];
    for (let i = 0; i < treeList.length; i++) {
      treeList[i].title = transformI18n(treeList[i].title);
      formatHigherMenuOptions(treeList[i].children);
      newTreeList.push(treeList[i]);
    }
    return newTreeList;
  }

  function openDialog(title = '新增', row?: FormItemProps) {
    addDialog({
      title: `${title}菜单`,
      props: {
        formInline: {
          id: row?.id,
          menuType: row?.menuType ?? 0,
          higherMenuOptions: formatHigherMenuOptions(cloneDeep(dataList.value)),
          parentId: row?.parentId ?? '',
          title: row?.title ?? '',
          name: row?.name ?? '',
          path: row?.path ?? '',
          component: row?.component ?? '',
          sort: row?.sort ?? 99,
          redirect: row?.redirect ?? '',
          icon: row?.icon ?? '',
          extraIcon: row?.extraIcon ?? '',
          enterTransition: row?.enterTransition ?? '',
          leaveTransition: row?.leaveTransition ?? '',
          activePath: row?.activePath ?? '',
          auths: row?.auths ?? '',
          frameSrc: row?.frameSrc ?? '',
          frameLoading: row?.frameLoading ?? 1,
          keepAlive: row?.keepAlive ?? 0,
          hiddenTag: row?.hiddenTag ?? 0,
          fixedTag: row?.fixedTag ?? 0,
          showLink: row?.showLink ?? 1,
          showParent: row?.showParent ?? 0
        }
      },
      width: '45%',
      draggable: true,
      fullscreen: deviceDetection(),
      fullscreenIcon: true,
      closeOnClickModal: false,
      contentRenderer: () =>
        h(editForm, { ref: formRef, formInline: null as any }),
      beforeSure: (done, { options }) => {
        const FormRef = formRef.value.getRef();
        const curData = options.props.formInline as FormItemProps;
        function chores() {
          message(
            `您${title}了菜单名称为${transformI18n(curData.title)}的这条数据`,
            {
              type: 'success'
            }
          );
          done(); // 关闭弹框
          onSearch(); // 刷新表格数据
        }
        FormRef.validate(async (valid: boolean) => {
          if (valid) {
            const meta: MenuMeta = {
              redirect: curData.redirect || undefined,
              extraIcon: curData.extraIcon || undefined,
              enterTransition: curData.enterTransition || undefined,
              leaveTransition: curData.leaveTransition || undefined,
              activePath: curData.activePath || undefined,
              frameSrc: curData.frameSrc || undefined,
              frameLoading: Boolean(curData.frameLoading),
              keepAlive: Boolean(curData.keepAlive),
              hiddenTag: Boolean(curData.hiddenTag),
              fixedTag: Boolean(curData.fixedTag),
              showParent: Boolean(curData.showParent)
            };
            const payload = {
              type: NUM_TO_MENU_TYPE[curData.menuType],
              parentId: (curData.parentId || null) as EntityId | null,
              name: curData.name,
              title: curData.title,
              icon: curData.icon || undefined,
              path: curData.path || undefined,
              component: curData.component || undefined,
              permission: curData.auths || undefined,
              sort: curData.sort,
              visible: Boolean(curData.showLink),
              meta
            };
            try {
              if (title === '新增') {
                await createMenu(payload as CreateMenuRequest);
              } else {
                await updateMenu(curData.id!, payload as UpdateMenuRequest);
              }
              chores();
            } catch {
              // http 层已 toast 后端 message
            }
          }
        });
      }
    });
  }

  async function handleDelete(row: any) {
    try {
      await deleteMenu(row.id);
      message(`已删除菜单名称为${transformI18n(row.title)}的数据`, {
        type: 'success'
      });
      onSearch();
    } catch {
      // http 层已 toast 后端 message
    }
  }

  onMounted(() => {
    onSearch();
  });

  return {
    form,
    loading,
    columns,
    dataList,
    /** 搜索 */
    onSearch,
    /** 重置 */
    resetForm,
    /** 新增、修改菜单 */
    openDialog,
    /** 删除菜单 */
    handleDelete,
    handleSelectionChange
  };
}
