import dayjs from 'dayjs';
import editForm from '../form.vue';
import { message } from '@/utils/message';
import { ElMessageBox } from 'element-plus';
import { usePublicHooks } from '../../hooks';
import { transformI18n } from '@/plugins/i18n';
import { addDialog } from '@/components/ReDialog';
import type { FormItemProps } from '../utils/types';
import type { PaginationProps } from '@pureadmin/table';
import type { EntityId, MenuVO, RoleQuery } from '@multi-admin/contracts';
import {
  createRole,
  deleteRole,
  getMenuList,
  getRoleList,
  getRoleMenuIds,
  setRoleMenus,
  updateRole
} from '@/api/system';
import { deviceDetection } from '@pureadmin/utils';
import { type Ref, reactive, ref, onMounted, h, watch } from 'vue';

/** 递归收集菜单树全部 id（替代扇平行的 getKeyList） */
function collectMenuIds(nodes: MenuVO[]): EntityId[] {
  const ids: EntityId[] = [];
  const walk = (list: MenuVO[]) => {
    list.forEach(node => {
      ids.push(node.id);
      if (node.children?.length) walk(node.children);
    });
  };
  walk(nodes);
  return ids;
}

export function useRole(treeRef: Ref) {
  const form = reactive({
    name: '',
    code: '',
    status: ''
  });
  const curRow = ref();
  const formRef = ref();
  const dataList = ref([]);
  const treeIds = ref([]);
  const treeData = ref([]);
  const isShow = ref(false);
  const loading = ref(true);
  const isLinkage = ref(false);
  const treeSearchValue = ref();
  const switchLoadMap = ref({});
  const isExpandAll = ref(false);
  const isSelectAll = ref(false);
  const { switchStyle } = usePublicHooks();
  const treeProps = {
    value: 'id',
    label: 'title',
    children: 'children'
  };
  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });
  const columns: TableColumnList = [
    {
      label: '角色编号',
      prop: 'id'
    },
    {
      label: '角色名称',
      prop: 'name'
    },
    {
      label: '角色标识',
      prop: 'code'
    },
    {
      label: '状态',
      cellRenderer: scope => (
        <el-switch
          size={scope.props.size === 'small' ? 'small' : 'default'}
          loading={switchLoadMap.value[scope.index]?.loading}
          v-model={scope.row.status}
          active-value={'ACTIVE'}
          inactive-value={'DISABLED'}
          active-text="已启用"
          inactive-text="已停用"
          inline-prompt
          style={switchStyle.value}
          onChange={() => onChange(scope as any)}
        />
      ),
      minWidth: 90
    },
    {
      label: '备注',
      prop: 'remark',
      minWidth: 160
    },
    {
      label: '创建时间',
      prop: 'createdAt',
      minWidth: 160,
      formatter: ({ createdAt }) =>
        dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      label: '操作',
      fixed: 'right',
      width: 210,
      slot: 'operation'
    }
  ];
  // const buttonClass = computed(() => {
  //   return [
  //     "h-5!",
  //     "reset-margin",
  //     "text-gray-500!",
  //     "dark:text-white!",
  //     "dark:hover:text-primary!"
  //   ];
  // });

  function onChange({ row, index }) {
    ElMessageBox.confirm(
      `确认要<strong>${
        row.status === 'DISABLED' ? '停用' : '启用'
      }</strong><strong style='color:var(--el-color-primary)'>${
        row.name
      }</strong>吗?`,
      '系统提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: true,
        draggable: true
      }
    )
      .then(async () => {
        switchLoadMap.value[index] = Object.assign(
          {},
          switchLoadMap.value[index],
          {
            loading: true
          }
        );
        try {
          await updateRole(row.id, { status: row.status });
          message(
            `已${row.status === 'DISABLED' ? '停用' : '启用'}${row.name}`,
            {
              type: 'success'
            }
          );
        } catch {
          row.status = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
        } finally {
          switchLoadMap.value[index] = Object.assign(
            {},
            switchLoadMap.value[index],
            {
              loading: false
            }
          );
        }
      })
      .catch(() => {
        row.status = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      });
  }

  async function handleDelete(row) {
    try {
      await deleteRole(row.id);
      message(`已删除角色名称为${row.name}的数据`, { type: 'success' });
      onSearch();
    } catch {
      // http 层已 toast 后端 message
    }
  }

  function handleSizeChange(val: number) {
    pagination.pageSize = val;
    onSearch();
  }

  function handleCurrentChange(val: number) {
    pagination.currentPage = val;
    onSearch();
  }

  function handleSelectionChange(val) {
    console.log('handleSelectionChange', val);
  }

  async function onSearch() {
    loading.value = true;
    const params: RoleQuery = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      name: form.name || undefined,
      code: form.code || undefined,
      status: (form.status as RoleQuery['status']) || undefined
    };
    const { code, data } = await getRoleList(params);
    if (code === 0) {
      dataList.value = data.items;
      pagination.total = data.total;
      pagination.pageSize = data.pageSize;
      pagination.currentPage = data.page;
    }
    loading.value = false;
  }

  const resetForm = formEl => {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  };

  function openDialog(title = '新增', row?: FormItemProps) {
    addDialog({
      title: `${title}角色`,
      props: {
        formInline: {
          title,
          id: row?.id,
          name: row?.name ?? '',
          code: row?.code ?? '',
          remark: row?.remark ?? ''
        }
      },
      width: '40%',
      draggable: true,
      fullscreen: deviceDetection(),
      fullscreenIcon: true,
      closeOnClickModal: false,
      contentRenderer: () => h(editForm, { ref: formRef, formInline: null }),
      beforeSure: (done, { options }) => {
        const FormRef = formRef.value.getRef();
        const curData = options.props.formInline as FormItemProps;
        function chores() {
          message(`您${title}了角色名称为${curData.name}的这条数据`, {
            type: 'success'
          });
          done(); // 关闭弹框
          onSearch(); // 刷新表格数据
        }
        FormRef.validate(async valid => {
          if (valid) {
            try {
              if (title === '新增') {
                await createRole({
                  code: curData.code,
                  name: curData.name,
                  remark: curData.remark || undefined
                });
              } else {
                await updateRole(curData.id, {
                  name: curData.name,
                  remark: curData.remark || undefined
                });
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

  /** 菜单权限 */
  async function handleMenu(row?: any) {
    const { id } = row;
    if (id) {
      curRow.value = row;
      isShow.value = true;
      const { code, data } = await getRoleMenuIds(id);
      if (code === 0) {
        treeRef.value.setCheckedKeys(data);
      }
    } else {
      curRow.value = null;
      isShow.value = false;
    }
  }

  /** 高亮当前权限选中行 */
  function rowStyle({ row: { id } }) {
    return {
      cursor: 'pointer',
      background: id === curRow.value?.id ? 'var(--el-fill-color-light)' : ''
    };
  }

  /** 菜单权限-保存 */
  function handleSave() {
    const { id, name } = curRow.value;
    setRoleMenus(id, { menuIds: treeRef.value.getCheckedKeys() })
      .then(() => {
        message(`角色名称为${name}的菜单权限修改成功`, {
          type: 'success'
        });
      })
      .catch(() => {
        // http 层已 toast 后端 message
      });
  }

  /** 数据权限 可自行开发 */
  // function handleDatabase() {}

  const onQueryChanged = (query: string) => {
    treeRef.value!.filter(query);
  };

  const filterMethod = (query: string, node) => {
    return transformI18n(node.title)!.includes(query);
  };

  onMounted(async () => {
    onSearch();
    const { code, data } = await getMenuList();
    if (code === 0) {
      treeIds.value = collectMenuIds(data);
      treeData.value = data;
    }
  });

  watch(isExpandAll, val => {
    val
      ? treeRef.value.setExpandedKeys(treeIds.value)
      : treeRef.value.setExpandedKeys([]);
  });

  watch(isSelectAll, val => {
    val
      ? treeRef.value.setCheckedKeys(treeIds.value)
      : treeRef.value.setCheckedKeys([]);
  });

  return {
    form,
    isShow,
    curRow,
    loading,
    columns,
    rowStyle,
    dataList,
    treeData,
    treeProps,
    isLinkage,
    pagination,
    isExpandAll,
    isSelectAll,
    treeSearchValue,
    // buttonClass,
    onSearch,
    resetForm,
    openDialog,
    handleMenu,
    handleSave,
    handleDelete,
    filterMethod,
    transformI18n,
    onQueryChanged,
    // handleDatabase,
    handleSizeChange,
    handleCurrentChange,
    handleSelectionChange
  };
}
