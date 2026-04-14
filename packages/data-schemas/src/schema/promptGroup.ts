import { Schema } from 'mongoose';
import { Constants } from 'librechat-data-provider';
import type { IPromptGroupDocument } from '~/types';

const promptGroupSchema = new Schema<IPromptGroupDocument>(
  {
    /** 组名称 */
    name: {
      type: String,
      required: true,
      index: true,
    },
    /** 生成次数 */
    numberOfGenerations: {
      type: Number,
      default: 0,
    },
    /** 一句话描述 */
    oneliner: {
      type: String,
      default: '',
    },
    /** 分类 */
    category: {
      type: String,
      default: '',
      index: true,
    },
    /** 所属项目 ID 列表 */
    projectIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Project',
      index: true,
      default: [],
    },
    /** 当前生产版本 Prompt ID */
    productionId: {
      type: Schema.Types.ObjectId,
      ref: 'Prompt',
      required: true,
      index: true,
    },
    /** 作者 ID */
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** 作者名称 */
    authorName: {
      type: String,
      required: true,
    },
    /** 快捷命令 */
    command: {
      type: String,
      index: true,
      validate: {
        validator: function (v: string | undefined | null): boolean {
          return v === undefined || v === null || v === '' || /^[a-z0-9-]+$/.test(v);
        },
        message: (props: { value?: string } | undefined) =>
          `${props?.value ?? 'Value'} is not a valid command. Only lowercase alphanumeric characters and hyphens are allowed.`,
      },
      maxlength: [
        Constants.COMMANDS_MAX_LENGTH as number,
        `Command cannot be longer than ${Constants.COMMANDS_MAX_LENGTH} characters`,
      ],
    }, // Casting here bypasses the type error for the command field.
  },
  {
    timestamps: true,
  },
);

promptGroupSchema.index({ createdAt: 1, updatedAt: 1 });

export default promptGroupSchema;
