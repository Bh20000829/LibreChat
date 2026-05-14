const mongoose = require('mongoose');

const imageGenerationUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    requestMessageId: {
      type: String,
      index: true,
    },
    responseMessageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    imageGenerationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImageGeneration',
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    endpointType: {
      type: String,
    },
    model: {
      type: String,
      required: true,
      index: true,
    },
    total_tokens: {
      type: Number,
      default: 0,
    },
    input_tokens: {
      type: Number,
      default: 0,
    },
    output_tokens: {
      type: Number,
      default: 0,
    },
    size: {
      type: String,
    },
    input_tokens_details: {
      type: mongoose.Schema.Types.Mixed,
    },
    output_tokens_details: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'image_generation_usages',
  },
);

module.exports =
  mongoose.models.ImageGenerationUsage ||
  mongoose.model('ImageGenerationUsage', imageGenerationUsageSchema);