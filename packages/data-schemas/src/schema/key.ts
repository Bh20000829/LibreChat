import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IKey extends Document {
  userId: Types.ObjectId;
  name: string;
  value: string;
  expiresAt?: Date;
}

const keySchema: Schema<IKey> = new Schema({
  /** 关联用户 */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  /** 键名称 */
  name: {
    type: String,
    required: true,
  },
  /** 键值 */
  value: {
    type: String,
    required: true,
  },
  /** 过期时间 */
  expiresAt: {
    type: Date,
  },
});

keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default keySchema;
