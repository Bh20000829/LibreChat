import { Schema, Document } from 'mongoose';

export interface IConversationTag extends Document {
  tag?: string;
  user?: string;
  description?: string;
  count?: number;
  position?: number;
}

const conversationTag = new Schema<IConversationTag>(
  {
    /** 标签名称 */
    tag: {
      type: String,
      index: true,
    },
    /** 所属用户 */
    user: {
      type: String,
      index: true,
    },
    /** 标签描述 */
    description: {
      type: String,
      index: true,
    },
    /** 使用次数 */
    count: {
      type: Number,
      default: 0,
    },
    /** 排序位置 */
    position: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true },
);

// Create a compound index on tag and user with unique constraint.
conversationTag.index({ tag: 1, user: 1 }, { unique: true });

export default conversationTag;
