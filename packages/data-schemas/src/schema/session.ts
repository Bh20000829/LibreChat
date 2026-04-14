import mongoose, { Schema } from 'mongoose';
import { ISession } from '~/types';

const sessionSchema: Schema<ISession> = new Schema({
  /** 刷新令牌哈希 */
  refreshTokenHash: {
    type: String,
    required: true,
  },
  /** 过期时间（到期自动删除） */
  expiration: {
    type: Date,
    required: true,
    expires: 0,
  },
  /** 关联用户 */
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

export default sessionSchema;
