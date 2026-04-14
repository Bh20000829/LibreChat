import { Schema } from 'mongoose';
import type { IAssistant } from '~/types';

const assistantSchema = new Schema<IAssistant>(
  {
    /** 所属用户 */
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** Assistant 平台 ID */
    assistant_id: {
      type: String,
      index: true,
      required: true,
    },
    /** 头像信息 */
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    /** 对话开场白列表 */
    conversation_starters: {
      type: [String],
      default: [],
    },
    /** 可见级别 */
    access_level: {
      type: Number,
    },
    /** 关联文件 ID 列表 */
    file_ids: { type: [String], default: undefined },
    /** 关联 action 列表 */
    actions: { type: [String], default: undefined },
    /** 是否追加当前时间 */
    append_current_datetime: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export default assistantSchema;
