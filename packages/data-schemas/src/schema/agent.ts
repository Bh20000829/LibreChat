import { Schema } from 'mongoose';
import type { IAgent } from '~/types';

const agentSchema = new Schema<IAgent>(
  {
    /** Agent 唯一 ID */
    id: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    /** Agent 名称 */
    name: {
      type: String,
    },
    /** Agent 描述 */
    description: {
      type: String,
    },
    /** 系统指令 */
    instructions: {
      type: String,
    },
    /** 头像配置 */
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    /** 提供方 */
    provider: {
      type: String,
      required: true,
    },
    /** 模型名称 */
    model: {
      type: String,
      required: true,
    },
    /** 模型参数 */
    model_parameters: {
      type: Object,
    },
    /** 工件链接/内容 */
    artifacts: {
      type: String,
    },
    /** 可见级别 */
    access_level: {
      type: Number,
    },
    /** 最大递归步数 */
    recursion_limit: {
      type: Number,
    },
    /** 启用工具列表 */
    tools: {
      type: [String],
      default: undefined,
    },
    /** 工具参数 */
    tool_kwargs: {
      type: [{ type: Schema.Types.Mixed }],
    },
    /** 关联 actions */
    actions: {
      type: [String],
      default: undefined,
    },
    /** 作者 ID */
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** 作者名称 */
    authorName: {
      type: String,
      default: undefined,
    },
    /** 是否隐藏顺序输出 */
    hide_sequential_outputs: {
      type: Boolean,
    },
    /** 工具后是否结束 */
    end_after_tools: {
      type: Boolean,
    },
    /** @deprecated Use edges instead */
    agent_ids: {
      type: [String],
    },
    /** 邻接边配置 */
    edges: {
      type: [{ type: Schema.Types.Mixed }],
      default: [],
    },
    /** 是否协作模式 */
    isCollaborative: {
      type: Boolean,
      default: undefined,
    },
    /** 开场建议 */
    conversation_starters: {
      type: [String],
      default: [],
    },
    /** 工具资源配置 */
    tool_resources: {
      type: Schema.Types.Mixed,
      default: {},
    },
    /** 所属项目 ID 列表 */
    projectIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Project',
      index: true,
    },
    /** 版本快照列表 */
    versions: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    /** 分类 */
    category: {
      type: String,
      trim: true,
      index: true,
      default: 'general',
    },
    /** 支持联系方式 */
    support_contact: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    /** 是否推荐 */
    is_promoted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

agentSchema.index({ updatedAt: -1, _id: 1 });

export default agentSchema;
