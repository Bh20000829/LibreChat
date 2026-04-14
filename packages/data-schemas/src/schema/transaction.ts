import mongoose, { Schema, Document, Types } from 'mongoose';

// @ts-ignore
export interface ITransaction extends Document {
  /** 用户 ID（关联 User 集合） */
  user: Types.ObjectId;
  /** 会话 ID（关联 Conversation，便于按会话追踪消费） */
  conversationId?: string;
  /** 交易类型：prompt=输入消耗，completion=输出消耗，credits=余额增减 */
  tokenType: 'prompt' | 'completion' | 'credits';
  /** 模型名称（用于计费和统计） */
  model?: string;
  /** 业务上下文（如 message、reasoning 等） */
  context?: string;
  /** 计费配置键（用于匹配具体价格配置） */
  valueKey?: string;
  /** 单位费率（每 token 的计费倍率） */
  rate?: number;
  /** 原始 token 数量（一般为负数表示扣减） */
  rawAmount?: number;
  /** 换算后的金额/积分变化值 */
  tokenValue?: number;
  /** 输入 token 数（结构化计费时使用） */
  inputTokens?: number;
  /** 缓存写入 token 数（cache write） */
  writeTokens?: number;
  /** 缓存读取 token 数（cache read） */
  readTokens?: number;
  /** 记录创建时间（timestamps 自动生成） */
  createdAt?: Date;
  /** 记录更新时间（timestamps 自动生成） */
  updatedAt?: Date;
}

const transactionSchema: Schema<ITransaction> = new Schema(
  {
    /** 用户 ID（必填，索引） */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    /** 会话 ID（可选，索引） */
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    /** 交易类型：prompt/completion/credits */
    tokenType: {
      type: String,
      enum: ['prompt', 'completion', 'credits'],
      required: true,
    },
    /** 模型名称 */
    model: {
      type: String,
    },
    /** 上下文标签 */
    context: {
      type: String,
    },
    /** 计费键（用于路由到对应费率） */
    valueKey: {
      type: String,
    },
    /** 费率 */
    rate: Number,
    /** 原始 token 变化量 */
    rawAmount: Number,
    /** 按费率换算后的变化值 */
    tokenValue: Number,
    /** 输入 token 数 */
    inputTokens: { type: Number },
    /** 缓存写入 token 数 */
    writeTokens: { type: Number },
    /** 缓存读取 token 数 */
    readTokens: { type: Number },
  },
  {
    /** 自动维护 createdAt / updatedAt */
    timestamps: true,
  },
);

export default transactionSchema;
