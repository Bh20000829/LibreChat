import { Schema } from 'mongoose';
import { conversationPreset } from './defaults';
import { IConversation } from '~/types';

const convoSchema: Schema<IConversation> = new Schema(
  {
    /** 会话唯一 ID */
    conversationId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    /** 会话标题 */
    title: {
      type: String,
      default: 'New Chat',
      meiliIndex: true,
    },
    /** 所属用户 */
    user: {
      type: String,
      index: true,
      meiliIndex: true,
    },
    /** 关联消息列表 */
    messages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
    /** Agent 运行配置 */
    agentOptions: {
      type: Schema.Types.Mixed,
    },
    ...conversationPreset,
    /** 关联 Agent ID */
    agent_id: {
      type: String,
    },
    /** 标签列表 */
    tags: {
      type: [String],
      default: [],
      meiliIndex: true,
    },
    /** 关联文件 ID 列表 */
    files: {
      type: [String],
    },
    /** 过期时间 */
    expiredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

convoSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
convoSchema.index({ createdAt: 1, updatedAt: 1 });
convoSchema.index({ conversationId: 1, user: 1 }, { unique: true });

export default convoSchema;
