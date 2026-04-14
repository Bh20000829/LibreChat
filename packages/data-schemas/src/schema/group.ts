import { Schema } from 'mongoose';
import type { IGroup } from '~/types';

const groupSchema = new Schema<IGroup>(
  {
    /** 组名称 */
    name: {
      type: String,
      required: true,
      index: true,
    },
    /** 组描述 */
    description: {
      type: String,
      required: false,
    },
    /** 组邮箱 */
    email: {
      type: String,
      required: false,
      index: true,
    },
    /** 组头像 */
    avatar: {
      type: String,
      required: false,
    },
    /** 成员 ID 列表 */
    memberIds: [
      {
        type: String,
        required: false,
      },
    ],
    /** 数据来源 */
    source: {
      type: String,
      enum: ['local', 'entra'],
      default: 'local',
    },
    /** External ID (e.g., Entra ID) */
    idOnTheSource: {
      type: String,
      sparse: true,
      index: true,
      required: function (this: IGroup) {
        return this.source !== 'local';
      },
    },
  },
  { timestamps: true },
);

groupSchema.index(
  { idOnTheSource: 1, source: 1 },
  {
    unique: true,
    partialFilterExpression: { idOnTheSource: { $exists: true } },
  },
);
groupSchema.index({ memberIds: 1 });

export default groupSchema;
