import { Schema } from 'mongoose';
import type { IAccessRole } from '~/types';

const accessRoleSchema = new Schema<IAccessRole>(
  {
    /** 访问角色唯一 ID */
    accessRoleId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    /** 角色名称 */
    name: {
      type: String,
      required: true,
    },
    /** 角色说明 */
    description: String,
    /** 资源类型 */
    resourceType: {
      type: String,
      enum: ['agent', 'project', 'file', 'promptGroup'],
      required: true,
      default: 'agent',
    },
    /** 权限位掩码 */
    permBits: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export default accessRoleSchema;
