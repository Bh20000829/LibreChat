const mongoose = require('mongoose');

const modelPricingSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    inputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    outputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    multiplier: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.models.ModelPricing || mongoose.model('ModelPricing', modelPricingSchema);