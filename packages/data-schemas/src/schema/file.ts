import mongoose, { Schema } from 'mongoose';
import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '~/types';

const file: Schema<IMongoFile> = new Schema(
  {
    /** 所属用户 */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    /** 所属会话 ID */
    conversationId: {
      type: String,
      ref: 'Conversation',
      index: true,
    },
    /** 文件唯一 ID */
    file_id: {
      type: String,
      index: true,
      required: true,
    },
    /** 临时文件 ID */
    temp_file_id: {
      type: String,
    },
    /** 文件大小（字节） */
    bytes: {
      type: Number,
      required: true,
    },
    /** 文件名 */
    filename: {
      type: String,
      required: true,
    },
    /** 文件路径 */
    filepath: {
      type: String,
      required: true,
    },
    /** 对象类型 */
    object: {
      type: String,
      required: true,
      default: 'file',
    },
    /** 是否已嵌入向量 */
    embedded: {
      type: Boolean,
    },
    /** 文件 MIME 类型 */
    type: {
      type: String,
      required: true,
    },
    /** 解析文本内容 */
    text: {
      type: String,
    },
    /** 文件上下文标签 */
    context: {
      type: String,
    },
    /** 使用次数 */
    usage: {
      type: Number,
      required: true,
      default: 0,
    },
    /** 来源类型 */
    source: {
      type: String,
      default: FileSources.local,
    },
    /** 关联模型 */
    model: {
      type: String,
    },
    /** 图片宽度 */
    width: Number,
    /** 图片高度 */
    height: Number,
    /** 额外元数据 */
    metadata: {
      fileIdentifier: String,
    },
    /** 临时过期时间（TTL） */
    expiresAt: {
      type: Date,
      expires: 3600, // 1 hour in seconds
    },
  },
  {
    timestamps: true,
  },
);

file.index({ createdAt: 1, updatedAt: 1 });

export default file;
