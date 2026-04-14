import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISharedLink extends Document {
  conversationId: string;
  title?: string;
  user?: string;
  messages?: Types.ObjectId[];
  shareId?: string;
  targetMessageId?: string;
  isPublic: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const shareSchema: Schema<ISharedLink> = new Schema(
  {
    /** 会话 ID */
    conversationId: {
      type: String,
      required: true,
    },
    /** 分享标题 */
    title: {
      type: String,
      index: true,
    },
    /** 分享所属用户 */
    user: {
      type: String,
      index: true,
    },
    /** 关联消息列表 */
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    /** 分享链接 ID */
    shareId: {
      type: String,
      index: true,
    },
    /** 目标消息 ID */
    targetMessageId: {
      type: String,
      required: false,
      index: true,
    },
    /** 是否公开 */
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

shareSchema.index({ conversationId: 1, user: 1, targetMessageId: 1 });

export default shareSchema;
