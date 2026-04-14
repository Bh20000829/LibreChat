import { Schema } from 'mongoose';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { IRole } from '~/types';

/**
 * Uses a sub-schema for permissions. Notice we disable `_id` for this subdocument.
 */
const rolePermissionsSchema = new Schema(
  {
    /** 书签权限 */
    [PermissionTypes.BOOKMARKS]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 提示词权限 */
    [PermissionTypes.PROMPTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean },
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
    },
    /** 记忆权限 */
    [PermissionTypes.MEMORIES]: {
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
      [Permissions.UPDATE]: { type: Boolean },
      [Permissions.READ]: { type: Boolean },
      [Permissions.OPT_OUT]: { type: Boolean },
    },
    /** Agent 权限 */
    [PermissionTypes.AGENTS]: {
      [Permissions.SHARED_GLOBAL]: { type: Boolean },
      [Permissions.USE]: { type: Boolean },
      [Permissions.CREATE]: { type: Boolean },
    },
    /** 多会话权限 */
    [PermissionTypes.MULTI_CONVO]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 临时聊天权限 */
    [PermissionTypes.TEMPORARY_CHAT]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 代码执行权限 */
    [PermissionTypes.RUN_CODE]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 网页搜索权限 */
    [PermissionTypes.WEB_SEARCH]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 人员选择器权限 */
    [PermissionTypes.PEOPLE_PICKER]: {
      [Permissions.VIEW_USERS]: { type: Boolean },
      [Permissions.VIEW_GROUPS]: { type: Boolean },
      [Permissions.VIEW_ROLES]: { type: Boolean },
    },
    /** 市场权限 */
    [PermissionTypes.MARKETPLACE]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 文件搜索权限 */
    [PermissionTypes.FILE_SEARCH]: {
      [Permissions.USE]: { type: Boolean },
    },
    /** 文件引用权限 */
    [PermissionTypes.FILE_CITATIONS]: {
      [Permissions.USE]: { type: Boolean },
    },
  },
  { _id: false },
);

const roleSchema: Schema<IRole> = new Schema({
  /** 角色名称 */
  name: { type: String, required: true, unique: true, index: true },
  /** 角色权限集合 */
  permissions: {
    type: rolePermissionsSchema,
  },
});

export default roleSchema;
