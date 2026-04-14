import { Schema } from 'mongoose';
import { PrincipalType, PrincipalModel, ResourceType } from 'librechat-data-provider';
import type { IAclEntry } from '~/types';

const aclEntrySchema = new Schema<IAclEntry>(
  {
    /** 主体类型（用户/组/角色/公开） */
    principalType: {
      type: String,
      enum: Object.values(PrincipalType),
      required: true,
    },
    /** 主体 ID */
    principalId: {
      type: Schema.Types.Mixed, // Can be ObjectId for users/groups or String for roles
      refPath: 'principalModel',
      required: function (this: IAclEntry) {
        return this.principalType !== PrincipalType.PUBLIC;
      },
      index: true,
    },
    /** 主体模型 */
    principalModel: {
      type: String,
      enum: Object.values(PrincipalModel),
      required: function (this: IAclEntry) {
        return this.principalType !== PrincipalType.PUBLIC;
      },
    },
    /** 资源类型 */
    resourceType: {
      type: String,
      enum: Object.values(ResourceType),
      required: true,
    },
    /** 资源 ID */
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    /** 权限位 */
    permBits: {
      type: Number,
      default: 1,
    },
    /** 绑定角色 ID */
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'AccessRole',
    },
    /** 继承来源条目 ID */
    inheritedFrom: {
      type: Schema.Types.ObjectId,
      sparse: true,
      index: true,
    },
    /** 授权人 */
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    /** 授权时间 */
    grantedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

aclEntrySchema.index({ principalId: 1, principalType: 1, resourceType: 1, resourceId: 1 });
aclEntrySchema.index({ resourceId: 1, principalType: 1, principalId: 1 });
aclEntrySchema.index({ principalId: 1, permBits: 1, resourceType: 1 });

export default aclEntrySchema;
