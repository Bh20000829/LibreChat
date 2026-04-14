import { Schema, Document, Types } from 'mongoose';

export interface IMongoProject extends Document {
  name: string;
  promptGroupIds: Types.ObjectId[];
  agentIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const projectSchema = new Schema<IMongoProject>(
  {
    /** 项目名称 */
    name: {
      type: String,
      required: true,
      index: true,
    },
    /** 绑定的提示词组 ID 列表 */
    promptGroupIds: {
      type: [Schema.Types.ObjectId],
      ref: 'PromptGroup',
      default: [],
    },
    /** 绑定的 Agent ID 列表 */
    agentIds: {
      type: [String],
      ref: 'Agent',
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export default projectSchema;
