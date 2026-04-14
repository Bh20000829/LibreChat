import mongoose, { Schema } from 'mongoose';
import type { IMessage } from '~/types/message';

const messageSchema: Schema<IMessage> = new Schema(
  {
    /** 消息唯一 ID */
    messageId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      meiliIndex: true,
    },
    /** 会话 ID */
    conversationId: {
      type: String,
      index: true,
      required: true,
      meiliIndex: true,
    },
    /** 所属用户 */
    user: {
      type: String,
      index: true,
      required: true,
      default: null,
      meiliIndex: true,
    },
    /** 模型名称 */
    model: {
      type: String,
      default: null,
    },
    /** 端点 */
    endpoint: {
      type: String,
    },
    /** 会话签名 */
    conversationSignature: {
      type: String,
    },
    /** 客户端 ID */
    clientId: {
      type: String,
    },
    /** 调用序号 */
    invocationId: {
      type: Number,
    },
    /** 父消息 ID */
    parentMessageId: {
      type: String,
    },
    /** token 数 */
    tokenCount: {
      type: Number,
    },
    /** 摘要 token 数 */
    summaryTokenCount: {
      type: Number,
    },
    /** 发送者 */
    sender: {
      type: String,
      meiliIndex: true,
    },
    /** 消息文本 */
    text: {
      type: String,
      meiliIndex: true,
    },
    /** 摘要文本 */
    summary: {
      type: String,
    },
    /** 是否用户创建 */
    isCreatedByUser: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** 是否未完成 */
    unfinished: {
      type: Boolean,
      default: false,
    },
    /** 是否错误消息 */
    error: {
      type: Boolean,
      default: false,
    },
    /** 完成原因 */
    finish_reason: {
      type: String,
    },
    /** 用户反馈 */
    feedback: {
      type: {
        rating: {
          type: String,
          enum: ['thumbsUp', 'thumbsDown'],
          required: true,
        },
        tag: {
          type: mongoose.Schema.Types.Mixed,
          required: false,
        },
        text: {
          type: String,
          required: false,
        },
      },
      default: undefined,
      required: false,
    },
    /** Meilisearch 索引标记 */
    _meiliIndex: {
      type: Boolean,
      required: false,
      select: false,
      default: false,
    },
    /** 文件列表 */
    files: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /** 单插件执行信息 */
    plugin: {
      type: {
        latest: {
          type: String,
          required: false,
        },
        inputs: {
          type: [mongoose.Schema.Types.Mixed],
          required: false,
          default: undefined,
        },
        outputs: {
          type: String,
          required: false,
        },
      },
      default: undefined,
    },
    /** 多插件执行信息 */
    plugins: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /** 结构化内容块 */
    content: {
      type: [{ type: mongoose.Schema.Types.Mixed }],
      default: undefined,
      meiliIndex: true,
    },
    /** 线程 ID */
    thread_id: {
      type: String,
    },
    /* frontend components */
    /** 图标 URL */
    iconURL: {
      type: String,
    },
    /** 额外元数据 */
    metadata: { type: mongoose.Schema.Types.Mixed },
    /** 附件列表 */
    attachments: { type: [{ type: mongoose.Schema.Types.Mixed }], default: undefined },
    /*
    attachments: {
      type: [
        {
          file_id: String,
          filename: String,
          filepath: String,
          expiresAt: Date,
          width: Number,
          height: Number,
          type: String,
          conversationId: String,
          messageId: {
            type: String,
            required: true,
          },
          toolCallId: String,
        },
      ],
      default: undefined,
    },
    */
    /** 过期时间 */
    expiredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

messageSchema.index({ expiredAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ messageId: 1, user: 1 }, { unique: true });

export default messageSchema;
