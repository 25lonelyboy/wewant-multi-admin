import './reset.css';
import dayjs from 'dayjs';
import roleForm from '../form/role.vue';
import editForm from '../form/index.vue';
import { handleTree } from '@/utils/tree';
import { message } from '@/utils/message';
import userAvatar from '@/assets/user.jpg';
import { usePublicHooks } from '../../hooks';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { addDialog } from '@/components/ReDialog';
import type { PaginationProps } from '@pureadmin/table';
import ReCropperPreview from '@/components/ReCropperPreview';
import type {
  CropperPayload,
  DeptTreeNode,
  FormItemProps,
  RoleFormItemProps
} from '../utils/types';
import {
  getKeyList,
  isAllEmpty,
  hideTextAtIndex,
  deviceDetection
} from '@pureadmin/utils';
import type {
  RoleOption,
  UserQuery,
  UserStatus,
  UserVO
} from '@multi-admin/contracts';
import {
  createUser,
  deleteUser,
  getAllRoles,
  getDeptList,
  getUserList,
  getUserRoleIds,
  setUserRoles,
  updateUser
} from '@/api/system';
import {
  ElForm,
  ElInput,
  ElFormItem,
  ElProgress,
  ElMessageBox,
  type FormInstance
} from 'element-plus';
import { type Ref, h, ref, watch, computed, reactive, onMounted } from 'vue';

export function useUser(tableRef: Ref, treeRef: Ref) {
  const form = reactive({
    // 左侧部门树的id
    deptId: '',
    username: '',
    phone: '',
    status: ''
  });
  const formRef = ref();
  const ruleFormRef = ref();
  const dataList = ref<UserVO[]>([]);
  const loading = ref(true);
  // 上传头像信息（裁剪结果载荷）
  const avatarInfo = ref<CropperPayload>();
  const switchLoadMap = ref<Record<number, { loading?: boolean }>>({});
  const { switchStyle } = usePublicHooks();
  const higherDeptOptions = ref();
  const treeData = ref<DeptTreeNode[]>([]);
  const treeLoading = ref(true);
  const selectedNum = ref(0);
  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });
  const columns: TableColumnList = [
    {
      label: '勾选列', // 如果需要表格多选，此处label必须设置
      type: 'selection',
      fixed: 'left',
      reserveSelection: true // 数据刷新后保留选项
    },
    {
      label: '用户编号',
      prop: 'id',
      width: 90
    },
    {
      label: '用户头像',
      prop: 'avatar',
      cellRenderer: ({ row }) => (
        <el-image
          fit="cover"
          preview-teleported={true}
          src={row.avatar || userAvatar}
          preview-src-list={Array.of(row.avatar || userAvatar)}
          class="size-6 rounded-full align-middle"
        />
      ),
      width: 90
    },
    {
      label: '用户名称',
      prop: 'username',
      minWidth: 130
    },
    {
      label: '用户昵称',
      prop: 'nickname',
      minWidth: 130
    },
    {
      label: '性别',
      prop: 'sex',
      minWidth: 90,
      cellRenderer: ({ row, props }) => (
        <el-tag
          size={props.size}
          type={row.sex === 1 ? 'danger' : undefined}
          effect="plain"
        >
          {row.sex === 1 ? '女' : '男'}
        </el-tag>
      )
    },
    {
      label: '部门',
      prop: 'dept.name',
      minWidth: 90
    },
    {
      label: '手机号码',
      prop: 'phone',
      minWidth: 90,
      formatter: ({ phone }) => hideTextAtIndex(phone, { start: 3, end: 6 })
    },
    {
      label: '状态',
      prop: 'status',
      minWidth: 90,
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
          onChange={() => onChange(scope as { row: UserVO; index: number })}
        />
      )
    },
    {
      label: '创建时间',
      minWidth: 90,
      prop: 'createdAt',
      formatter: ({ createdAt }) =>
        dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      label: '操作',
      fixed: 'right',
      width: 180,
      slot: 'operation'
    }
  ];
  const buttonClass = computed(() => {
    return [
      'h-5!',
      'reset-margin',
      'text-gray-500!',
      'dark:text-white!',
      'dark:hover:text-primary!'
    ];
  });
  // 重置的新密码
  const pwdForm = reactive({
    newPwd: ''
  });
  const pwdProgress = [
    { color: '#e74242', text: '非常弱' },
    { color: '#EFBD47', text: '弱' },
    { color: '#ffa500', text: '一般' },
    { color: '#1bbf1b', text: '强' },
    { color: '#008000', text: '非常强' }
  ];
  // 当前密码强度（0-4）
  const curScore = ref();
  const roleOptions = ref<RoleOption[]>([]);
  const zxcvbnFactory = new ZxcvbnFactory();

  function onChange({ row, index }: { row: UserVO; index: number }) {
    ElMessageBox.confirm(
      `确认要<strong>${
        row.status === 'DISABLED' ? '停用' : '启用'
      }</strong><strong style='color:var(--el-color-primary)'>${
        row.username
      }</strong>用户吗?`,
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
          await updateUser(row.id, { status: row.status });
          message('已成功修改用户状态', {
            type: 'success'
          });
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

  function handleUpdate(row: UserVO) {
    console.log(row);
  }

  async function handleDelete(row: UserVO) {
    try {
      await deleteUser(row.id);
      message(`已删除用户编号为${row.id}的数据`, { type: 'success' });
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

  /** 当CheckBox选择项发生变化时会触发该事件 */
  function handleSelectionChange(val: UserVO[]) {
    selectedNum.value = val.length;
    // 重置表格高度
    tableRef.value.setAdaptive();
  }

  /** 取消选择 */
  function onSelectionCancel() {
    selectedNum.value = 0;
    // 用于多选表格，清空用户的选择
    tableRef.value.getTableRef().clearSelection();
  }

  /** 批量删除 */
  function onbatchDel() {
    // 返回当前选中的行
    const curSelected = tableRef.value.getTableRef().getSelectionRows();
    // 接下来根据实际业务，通过选中行的某项数据，比如下面的id，调用接口进行批量删除
    message(`已删除用户编号为 ${getKeyList(curSelected, 'id')} 的数据`, {
      type: 'success'
    });
    tableRef.value.getTableRef().clearSelection();
    onSearch();
  }

  async function onSearch() {
    loading.value = true;
    const params: UserQuery = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      username: form.username || undefined,
      status: (form.status as UserStatus) || undefined
    };
    const { code, data } = await getUserList(params);
    if (code === 0) {
      dataList.value = data.items;
      pagination.total = data.total;
      pagination.pageSize = data.pageSize;
      pagination.currentPage = data.page;
    }
    loading.value = false;
  }

  const resetForm = (formEl: FormInstance | undefined) => {
    if (!formEl) return;
    formEl.resetFields();
    form.deptId = '';
    treeRef.value.onTreeReset();
    onSearch();
  };

  /** 部门树节点 id 为数字主键，统一转字符串入 form */
  function onTreeSelect({ id, selected }: { id: number; selected: boolean }) {
    form.deptId = selected ? String(id) : '';
    onSearch();
  }

  function formatHigherDeptOptions(
    treeList: DeptTreeNode[] | undefined
  ): DeptTreeNode[] | undefined {
    // 根据返回数据的status字段值判断追加是否禁用disabled字段，返回处理后的树结构，用于上级部门级联选择器的展示（实际开发中也是如此，不可能前端需要的每个字段后端都会返回，这时需要前端自行根据后端返回的某些字段做逻辑处理）
    if (!treeList || !treeList.length) return;
    const newTreeList: DeptTreeNode[] = [];
    for (let i = 0; i < treeList.length; i++) {
      treeList[i].disabled = treeList[i].status === 0 ? true : false;
      formatHigherDeptOptions(treeList[i].children);
      newTreeList.push(treeList[i]);
    }
    return newTreeList;
  }

  function openDialog(title = '新增', row?: FormItemProps) {
    addDialog({
      title: `${title}用户`,
      props: {
        formInline: {
          title,
          id: row?.id,
          higherDeptOptions: formatHigherDeptOptions(higherDeptOptions.value),
          parentId: row?.dept?.id ?? 0,
          nickname: row?.nickname ?? '',
          username: row?.username ?? '',
          password: row?.password ?? '',
          phone: row?.phone ?? '',
          email: row?.email ?? '',
          sex: row?.sex ?? '',
          status: row?.status ?? 'ACTIVE',
          remark: row?.remark ?? ''
        }
      },
      width: '46%',
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
          message(`您${title}了用户名称为${curData.username}的这条数据`, {
            type: 'success'
          });
          done();
          onSearch();
        }
        FormRef.validate(async (valid: boolean) => {
          if (valid) {
            const payload = {
              nickname: curData.nickname,
              username: curData.username,
              password: curData.password,
              phone: curData.phone === '' ? undefined : String(curData.phone),
              email: curData.email || undefined,
              sex: (curData.sex === '' ? undefined : Number(curData.sex)) as
                0 | 1 | undefined,
              status: curData.status,
              remark: curData.remark || undefined
            };
            try {
              if (title === '新增') {
                await createUser(payload);
              } else {
                const { username: _u, password: _p, ...rest } = payload;
                await updateUser(curData.id!, rest);
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

  const cropRef = ref();
  /** 上传头像 */
  function handleUpload(row: UserVO) {
    addDialog({
      title: '裁剪、上传头像',
      width: '40%',
      closeOnClickModal: false,
      fullscreen: deviceDetection(),
      contentRenderer: () =>
        h(ReCropperPreview, {
          ref: cropRef,
          imgSrc: row.avatar || userAvatar,
          onCropper: (info: CropperPayload) => (avatarInfo.value = info)
        }),
      beforeSure: done => {
        console.log('裁剪后的图片信息：', avatarInfo.value);
        // 根据实际业务使用avatarInfo.value和row里的某些字段去调用上传头像接口即可
        done(); // 关闭弹框
        onSearch(); // 刷新表格数据
      },
      closeCallBack: () => cropRef.value.hidePopover()
    });
  }

  watch(
    pwdForm,
    ({ newPwd }) =>
      (curScore.value = isAllEmpty(newPwd)
        ? -1
        : zxcvbnFactory.check(newPwd).score)
  );

  /** 重置密码 */
  function handleReset(row: UserVO) {
    addDialog({
      title: `重置 ${row.username} 用户的密码`,
      width: '30%',
      draggable: true,
      closeOnClickModal: false,
      fullscreen: deviceDetection(),
      contentRenderer: () => (
        <>
          <ElForm ref={ruleFormRef} model={pwdForm}>
            <ElFormItem
              prop="newPwd"
              rules={[
                {
                  required: true,
                  message: '请输入新密码',
                  trigger: 'blur'
                }
              ]}
            >
              <ElInput
                clearable
                show-password
                type="password"
                v-model={pwdForm.newPwd}
                placeholder="请输入新密码"
              />
            </ElFormItem>
          </ElForm>
          <div class="my-4 flex">
            {pwdProgress.map(({ color, text }, idx) => (
              <div
                class="w-[19vw]"
                style={{ marginLeft: idx !== 0 ? '4px' : 0 }}
              >
                <ElProgress
                  striped
                  striped-flow
                  duration={curScore.value === idx ? 6 : 0}
                  percentage={curScore.value >= idx ? 100 : 0}
                  color={color}
                  stroke-width={10}
                  show-text={false}
                />
                <p
                  class="text-center"
                  style={{ color: curScore.value === idx ? color : '' }}
                >
                  {text}
                </p>
              </div>
            ))}
          </div>
        </>
      ),
      closeCallBack: () => (pwdForm.newPwd = ''),
      beforeSure: done => {
        ruleFormRef.value.validate(async (valid: boolean) => {
          if (valid) {
            try {
              await updateUser(row.id, { password: pwdForm.newPwd });
              message(`已成功重置 ${row.username} 用户的密码`, {
                type: 'success'
              });
              done();
              onSearch();
            } catch {
              // http 层已 toast 后端 message
            }
          }
        });
      }
    });
  }

  /** 分配角色 */
  async function handleRole(row: UserVO) {
    const ids = (await getUserRoleIds(row.id)).data ?? [];
    addDialog({
      title: `分配 ${row.username} 用户的角色`,
      props: {
        formInline: {
          username: row?.username ?? '',
          nickname: row?.nickname ?? '',
          roleOptions: roleOptions.value ?? [],
          ids
        }
      },
      width: '400px',
      draggable: true,
      fullscreen: deviceDetection(),
      fullscreenIcon: true,
      closeOnClickModal: false,
      contentRenderer: () => h(roleForm),
      beforeSure: (done, { options }) => {
        const curData = options.props.formInline as RoleFormItemProps;
        setUserRoles(row.id, { roleIds: curData.ids })
          .then(() => {
            message(`已成功分配 ${row.username} 用户的角色`, {
              type: 'success'
            });
            done();
          })
          .catch(() => {
            // http 层已 toast 后端 message
          });
      }
    });
  }

  onMounted(async () => {
    treeLoading.value = true;
    onSearch();

    try {
      const { code, data } = await getDeptList();
      if (code === 0) {
        higherDeptOptions.value = handleTree(data);
        treeData.value = handleTree(data);
      }
    } catch {
      // 降级：部门树保持空态
    } finally {
      treeLoading.value = false;
    }

    roleOptions.value = (await getAllRoles()).data ?? [];
  });

  return {
    form,
    loading,
    columns,
    dataList,
    treeData,
    treeLoading,
    selectedNum,
    pagination,
    buttonClass,
    deviceDetection,
    onSearch,
    resetForm,
    onbatchDel,
    openDialog,
    onTreeSelect,
    handleUpdate,
    handleDelete,
    handleUpload,
    handleReset,
    handleRole,
    handleSizeChange,
    onSelectionCancel,
    handleCurrentChange,
    handleSelectionChange
  };
}
