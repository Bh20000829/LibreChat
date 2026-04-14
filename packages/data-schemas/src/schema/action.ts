import mongoose, { Schema } from 'mongoose';
import type { IAction } from '~/types';

// Define the Auth sub-schema with type-safety.
const AuthSchema = new Schema(
  {
    /** 认证类型 */
    authorization_type: { type: String },
    /** 自定义认证头 */
    custom_auth_header: { type: String },
    /** 认证方案 */
    type: { type: String, enum: ['service_http', 'oauth', 'none'] },
    /** 认证内容类型 */
    authorization_content_type: { type: String },
    /** 授权地址 */
    authorization_url: { type: String },
    /** 客户端地址 */
    client_url: { type: String },
    /** OAuth scope */
    scope: { type: String },
    /** 令牌交换方式 */
    token_exchange_method: { type: String, enum: ['default_post', 'basic_auth_header', null] },
  },
  { _id: false },
);

const Action = new Schema<IAction>({
  /** 所属用户 */
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  /** Action 唯一 ID */
  action_id: {
    type: String,
    index: true,
    required: true,
  },
  /** Action 类型 */
  type: {
    type: String,
    default: 'action_prototype',
  },
  /** Action 设置 */
  settings: Schema.Types.Mixed,
  /** 关联 agent ID */
  agent_id: String,
  /** 关联 assistant ID */
  assistant_id: String,
  /** 第三方 API 元数据 */
  metadata: {
    /** API Key */
    api_key: String,
    /** 认证配置 */
    auth: AuthSchema,
    /** 接口域名 */
    domain: {
      type: String,
      required: true,
    },
    /** 隐私政策链接 */
    privacy_policy_url: String,
    /** 原始 OpenAPI 规范 */
    raw_spec: String,
    /** OAuth 客户端 ID */
    oauth_client_id: String,
    /** OAuth 客户端密钥 */
    oauth_client_secret: String,
  },
});

export default Action;
