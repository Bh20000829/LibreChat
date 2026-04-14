import { Schema } from 'mongoose';
import type { IAgentCategory } from '~/types';

const agentCategorySchema = new Schema<IAgentCategory>(
  {
    /** 分类值（唯一） */
    value: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    /** 分类显示名 */
    label: {
      type: String,
      required: true,
      trim: true,
    },
    /** 分类描述 */
    description: {
      type: String,
      trim: true,
      default: '',
    },
    /** 排序顺序 */
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    /** 是否启用 */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    /** 是否为自定义分类 */
    custom: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

agentCategorySchema.index({ isActive: 1, order: 1 });
agentCategorySchema.index({ order: 1, label: 1 });

export default agentCategorySchema;
