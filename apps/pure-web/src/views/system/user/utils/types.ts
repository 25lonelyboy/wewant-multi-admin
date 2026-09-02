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

/** 部门树节点（getDeptList 无契约 VO，前端局部结构：含级联/树渲染附加字段，id 为数字主键） */
interface DeptTreeNode {
  id: number;
  parentId?: number;
  name: string;
  /** 0 = 禁用（级联选择置灰依据） */
  status?: number;
  disabled?: boolean;
  children?: DeptTreeNode[];
}

/** ReCropper/ReCropperPreview cropper 事件载荷（裁剪结果） */
interface CropperPayload {
  base64: string | ArrayBuffer;
  blob: Blob;
  info: { size: number } & Record<string, number>;
}

export type {
  DeptTreeNode,
  CropperPayload,
  FormItemProps,
  FormProps,
  RoleFormItemProps,
  RoleFormProps
};
