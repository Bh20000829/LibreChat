import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TAttachment } from 'librechat-data-provider';

export interface IToolCallData extends Document {
  conversationId: string;
  messageId: string;
  toolId: string;
  user: Types.ObjectId;
  result?: unknown;
  attachments?: TAttachment[];
  blockIndex?: number;
  partIndex?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const toolCallSchema: Schema<IToolCallData> = new Schema(
  {
    /** 会话 ID */
    conversationId: {
      type: String,
      required: true,
    },
    /** 消息 ID */
    messageId: {
      type: String,
      required: true,
    },
    /** 工具 ID */
    toolId: {
      type: String,
      required: true,
    },
    /** 所属用户 */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** 工具执行结果 */
    result: {
      type: mongoose.Schema.Types.Mixed,
    },
    /** 关联附件 */
    attachments: {
      type: mongoose.Schema.Types.Mixed,
    },
    /** 内容块索引 */
    blockIndex: {
      type: Number,
    },
    /** 分片索引 */
    partIndex: {
      type: Number,
    },
  },
  { timestamps: true },
);

toolCallSchema.index({ messageId: 1, user: 1 });
toolCallSchema.index({ conversationId: 1, user: 1 });

export default toolCallSchema;
