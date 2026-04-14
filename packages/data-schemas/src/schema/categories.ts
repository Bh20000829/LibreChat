import { Schema, Document } from 'mongoose';

export interface ICategory extends Document {
  label: string;
  value: string;
}

const categoriesSchema = new Schema<ICategory>({
  /** 分类显示名 */
  label: {
    type: String,
    required: true,
    unique: true,
  },
  /** 分类值（程序使用） */
  value: {
    type: String,
    required: true,
    unique: true,
  },
});

export default categoriesSchema;
