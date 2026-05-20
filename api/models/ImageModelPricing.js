const mongoose = require('mongoose');

const imageModelPricingSchema = new mongoose.Schema(
  {
    modelName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    textInputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    cachePrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    textOutputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    imageInputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    imageOutputPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    requestPrice: {
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

module.exports =
  mongoose.models.ImageModelPricing || mongoose.model('ImageModelPricing', imageModelPricingSchema);
