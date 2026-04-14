import { Schema } from 'mongoose';
import type { IPluginAuth } from '~/types';

const pluginAuthSchema: Schema<IPluginAuth> = new Schema(
  {
    /** 鉴权字段名 */
    authField: {
      type: String,
      required: true,
    },
    /** 鉴权字段值 */
    value: {
      type: String,
      required: true,
    },
    /** 用户 ID */
    userId: {
      type: String,
      required: true,
    },
    /** 插件唯一键 */
    pluginKey: {
      type: String,
    },
  },
  { timestamps: true },
);

export default pluginAuthSchema;
