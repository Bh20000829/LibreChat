import { Schema } from 'mongoose';
import type * as t from '~/types';

const balanceSchema = new Schema<t.IBalance>({
  /** 所属用户 */
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    required: true,
  },
  // 1000 tokenCredits = 1 mill ($0.001 USD)
  /** 当前积分余额 */
  tokenCredits: {
    type: Number,
    default: 0,
  },
  // Automatic refill settings
  /** 是否启用自动补充 */
  autoRefillEnabled: {
    type: Boolean,
    default: false,
  },
  /** 自动补充间隔数值 */
  refillIntervalValue: {
    type: Number,
    default: 30,
  },
  /** 自动补充间隔单位 */
  refillIntervalUnit: {
    type: String,
    enum: ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'],
    default: 'days',
  },
  /** 上次补充时间 */
  lastRefill: {
    type: Date,
    default: Date.now,
  },
  // amount to add on each refill
  /** 每次补充金额 */
  refillAmount: {
    type: Number,
    default: 0,
  },
});

export default balanceSchema;
