import { Schema } from 'mongoose';
import { IToken } from '~/types';

const tokenSchema: Schema<IToken> = new Schema({
  /** 用户 ID */
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'user',
  },
  /** 用户邮箱 */
  email: {
    type: String,
  },
  /** token 类型 */
  type: {
    type: String,
  },
  /** 业务标识 */
  identifier: {
    type: String,
  },
  /** token 值 */
  token: {
    type: String,
    required: true,
  },
  /** 创建时间 */
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  /** 过期时间 */
  expiresAt: {
    type: Date,
    required: true,
  },
  /** 附加元数据 */
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
  },
});

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default tokenSchema;
