interface FormItemProps {
  /** 菜单 id（编辑态存在） */
  id?: string;
  /** 菜单类型（0代表菜单、1代表iframe、2代表外链、3代表按钮）*/
  menuType: number;
  higherMenuOptions: Record<string, unknown>[];
  parentId: string;
  title: string;
  name: string;
  path: string;
  component: string;
  sort: number;
  redirect: string;
  icon: string;
  extraIcon: string;
  enterTransition: string;
  leaveTransition: string;
  activePath: string;
  auths: string;
  frameSrc: string;
  frameLoading: boolean;
  keepAlive: boolean;
  hiddenTag: boolean;
  fixedTag: boolean;
  showLink: boolean;
  showParent: boolean;
}
interface FormProps {
  formInline: FormItemProps;
}

/** 菜单列表展示行（MenuVO 树展开后的表格/表单形态，布尔开关保持上游语义） */
interface MenuDisplayRow {
  id: string;
  parentId: string;
  menuType: number;
  title: string;
  name: string;
  icon: string;
  path: string;
  component: string;
  auths: string;
  sort: number;
  showLink: boolean;
  redirect: string;
  extraIcon: string;
  enterTransition: string;
  leaveTransition: string;
  activePath: string;
  frameSrc: string;
  frameLoading: boolean;
  keepAlive: boolean;
  hiddenTag: boolean;
  fixedTag: boolean;
  showParent: boolean;
  children: MenuDisplayRow[];
}

export type { FormItemProps, FormProps, MenuDisplayRow };
