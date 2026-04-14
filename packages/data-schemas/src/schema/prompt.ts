import { Schema } from 'mongoose';
import type { IPrompt } from '~/types';

const promptSchema: Schema<IPrompt> = new Schema(
  {
    /** 所属提示词组 */
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'PromptGroup',
      required: true,
      index: true,
    },
    /** 作者用户 */
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** 提示词内容 */
    prompt: {
      type: String,
      required: true,
    },
    /** 提示词类型 */
    type: {
      type: String,
      enum: ['text', 'chat'],
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

promptSchema.index({ createdAt: 1, updatedAt: 1 });

export default promptSchema;
