/** 部门展示行（契约暂无 DeptVO，字段与 /api/v1/system/dept 返回同形） */
interface DeptRow {
  id: number;
  parentId: number;
  name: string;
  principal: string;
  phone: string | number;
  email: string;
  sort: number;
  /** 状态 1 启用 0 停用 */
  status: number;
  createTime: string;
  remark: string;
  /** 级联选择器禁用标记（由 status 推导） */
  disabled?: boolean;
  children?: DeptRow[];
}

interface FormItemProps {
  higherDeptOptions: Record<string, unknown>[];
  parentId: number;
  name: string;
  principal: string;
  phone: string | number;
  email: string;
  sort: number;
  status: number;
  remark: string;
}
interface FormProps {
  formInline: FormItemProps;
}

export type { DeptRow, FormItemProps, FormProps };
