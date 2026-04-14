import { Schema } from 'mongoose';
import type { IMemoryEntry } from '~/types/memory';

const MemoryEntrySchema: Schema<IMemoryEntry> = new Schema({
  /** 所属用户 */
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  /** 记忆键名 */
  key: {
    type: String,
    required: true,
    validate: {
      validator: (v: string) => /^[a-z_]+$/.test(v),
      message: 'Key must only contain lowercase letters and underscores',
    },
  },
  /** 记忆内容 */
  value: {
    type: String,
    required: true,
  },
  /** token 数量 */
  tokenCount: {
    type: Number,
    default: 0,
  },
  /** 最后更新时间 */
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

export default MemoryEntrySchema;
