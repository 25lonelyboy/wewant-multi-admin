import dayjs from 'dayjs';
import { message } from '@/utils/message';
import { getOnlineLogsList } from '@/api/system';
import { reactive, ref, onMounted, toRaw } from 'vue';
import type { PaginationProps } from '@pureadmin/table';

export function useRole() {
  const form = reactive({
    username: ''
  });
  const dataList = ref<Record<string, any>[]>([]);
  const loading = ref(true);
  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });
  const columns: TableColumnList = [
    {
      label: '序号',
      prop: 'id',
      minWidth: 60
    },
    {
      label: '用户名',
      prop: 'username',
      minWidth: 100
    },
    {
      label: '登录 IP',
      prop: 'ip',
      minWidth: 140
    },
    {
      label: '登录地点',
      prop: 'address',
      minWidth: 140
    },
    {
      label: '操作系统',
      prop: 'system',
      minWidth: 100
    },
    {
      label: '浏览器类型',
      prop: 'browser',
      minWidth: 100
    },
    {
      label: '登录时间',
      prop: 'loginTime',
      minWidth: 180,
      formatter: ({ loginTime }) =>
        dayjs(loginTime).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      label: '操作',
      fixed: 'right',
      slot: 'operation'
    }
  ];

  function handleSizeChange(val: number) {
    console.log(`${val} items per page`);
  }

  function handleCurrentChange(val: number) {
    console.log(`current page: ${val}`);
  }

  function handleSelectionChange(val: any[]) {
    console.log('handleSelectionChange', val);
  }

  function handleOffline(row: any) {
    message(`${row.username}已被强制下线`, { type: 'success' });
    onSearch();
  }

  async function onSearch() {
    loading.value = true;
    const { code, data } = await getOnlineLogsList(toRaw(form));
    if (code === 0) {
      dataList.value = data.list;
      pagination.total = data.total ?? 0;
      pagination.pageSize = data.pageSize ?? 10;
      pagination.currentPage = data.currentPage ?? 1;
    }

    setTimeout(() => {
      loading.value = false;
    }, 500);
  }

  const resetForm = (formEl: any) => {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  };

  onMounted(() => {
    onSearch();
  });

  return {
    form,
    loading,
    columns,
    dataList,
    pagination,
    onSearch,
    resetForm,
    handleOffline,
    handleSizeChange,
    handleCurrentChange,
    handleSelectionChange
  };
}
