import type { EntityId, RoleOption, UserStatus } from '@multi-admin/contracts';

interface FormItemProps {
  id?: EntityId;
  /** 用于判断是`新增`还是`修改` */
  title: string;
  higherDeptOptions: Record<string, unknown>[];
  parentId: number;
  nickname: string;
  username: string;
  password: string;
  phone: string | number;
  email: string;
  sex: string | number;
  status: UserStatus;
  dept?: {
    id?: number;
    name?: string;
  };
  remark: string;
}
interface FormProps {
  formInline: FormItemProps;
}

interface RoleFormItemProps {
  username: string;
  nickname: string;
  /** 角色列表 */
  roleOptions: RoleOption[];
  /** 选中的角色列表 */
  ids: EntityId[];
}
interface RoleFormProps {
  formInline: RoleFormItemProps;
}

export type { FormItemProps, FormProps, RoleFormItemProps, RoleFormProps };
