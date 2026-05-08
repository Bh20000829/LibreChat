import { Schema } from 'mongoose';

// @ts-ignore
export const conversationPreset = {
  /** 会话模式 */
  mode: {
    type: String,
    enum: ['chat', 'image'],
    default: 'chat',
    index: true,
  },
  // endpoint: [azureOpenAI, openAI, anthropic, chatGPTBrowser]
  /** 接入端点 */
  endpoint: {
    type: String,
    default: null,
    required: true,
  },
  /** 端点类型 */
  endpointType: {
    type: String,
  },
  // for azureOpenAI, openAI, chatGPTBrowser only
  /** 模型名称 */
  model: {
    type: String,
    required: false,
  },
  // for bedrock only
  /** 区域（Bedrock） */
  region: {
    type: String,
    required: false,
  },
  // for azureOpenAI, openAI only
  /** 模型标签 */
  chatGptLabel: {
    type: String,
    required: false,
  },
  // for google only
  /** few-shot 示例 */
  examples: { type: [{ type: Schema.Types.Mixed }], default: undefined },
  /** 模型显示标签 */
  modelLabel: {
    type: String,
    required: false,
  },
  /** 提示词前缀 */
  promptPrefix: {
    type: String,
    required: false,
  },
  /** 温度参数 */
  temperature: {
    type: Number,
    required: false,
  },
  /** Top-p（snake_case） */
  top_p: {
    type: Number,
    required: false,
  },
  // for google only
  /** Top-p（camelCase） */
  topP: {
    type: Number,
    required: false,
  },
  /** Top-k */
  topK: {
    type: Number,
    required: false,
  },
  /** 最大输出 token */
  maxOutputTokens: {
    type: Number,
    required: false,
  },
  /** 最大 token */
  maxTokens: {
    type: Number,
    required: false,
  },
  /** presence 惩罚 */
  presence_penalty: {
    type: Number,
    required: false,
  },
  /** frequency 惩罚 */
  frequency_penalty: {
    type: Number,
    required: false,
  },
  /** 关联文件 ID */
  file_ids: { type: [{ type: String }], default: undefined },
  // deprecated
  /** 重发图片（已弃用） */
  resendImages: {
    type: Boolean,
  },
  /* Anthropic only */
  /** 提示词缓存开关 */
  promptCache: {
    type: Boolean,
  },
  /** 深度思考开关 */
  thinking: {
    type: Boolean,
  },
  /** 思考预算 */
  thinkingBudget: {
    type: Number,
  },
  /** 系统提示词 */
  system: {
    type: String,
  },
  // files
  /** 是否重发文件 */
  resendFiles: {
    type: Boolean,
  },
  /** 图片细节等级 */
  imageDetail: {
    type: String,
  },
  /* agents */
  /** Agent ID */
  agent_id: {
    type: String,
  },
  /* assistants */
  /** Assistant ID */
  assistant_id: {
    type: String,
  },
  /** 指令 */
  instructions: {
    type: String,
  },
  /** 停止词 */
  stop: { type: [{ type: String }], default: undefined },
  /** 是否归档 */
  isArchived: {
    type: Boolean,
    default: false,
  },
  /* UI Components */
  /** 图标 URL */
  iconURL: {
    type: String,
  },
  /** 欢迎语 */
  greeting: {
    type: String,
  },
  /** 规格标识 */
  spec: {
    type: String,
  },
  /** 标签列表 */
  tags: {
    type: [String],
    default: [],
  },
  /** 工具列表 */
  tools: { type: [{ type: String }], default: undefined },
  /** 最大上下文 token */
  maxContextTokens: {
    type: Number,
  },
  /** max_tokens（兼容字段） */
  max_tokens: {
    type: Number,
  },
  /** Responses API 开关 */
  useResponsesApi: {
    type: Boolean,
  },
  /** OpenAI Responses API / Anthropic API / Google API */
  /** 网页搜索开关 */
  web_search: {
    type: Boolean,
  },
  /** 禁用流式输出 */
  disableStreaming: {
    type: Boolean,
  },
  /** 文件 token 上限 */
  fileTokenLimit: {
    type: Number,
  },
  /** Reasoning models only */
  /** 推理强度 */
  reasoning_effort: {
    type: String,
  },
  /** 推理摘要级别 */
  reasoning_summary: {
    type: String,
  },
  /** Verbosity control */
  /** 输出冗长度控制 */
  verbosity: {
    type: String,
  },
};
