import { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
  bannerId: string;
  message: string;
  displayFrom: Date;
  displayTo?: Date;
  type: 'banner' | 'popup';
  isPublic: boolean;
}

const bannerSchema = new Schema<IBanner>(
  {
    /** 横幅唯一 ID */
    bannerId: {
      type: String,
      required: true,
    },
    /** 展示内容 */
    message: {
      type: String,
      required: true,
    },
    /** 生效开始时间 */
    displayFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    /** 生效结束时间 */
    displayTo: {
      type: Date,
    },
    /** 展示类型 */
    type: {
      type: String,
      enum: ['banner', 'popup'],
      default: 'banner',
    },
    /** 是否公开展示 */
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default bannerSchema;
