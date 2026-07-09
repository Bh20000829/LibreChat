const mongoose = require('mongoose');

const imageGenerationSchema = new mongoose.Schema(
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
    operationType: {
      type: String,
      enum: ['generation', 'edit'],
      default: 'generation',
      index: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    sourceImageFileIds: {
      type: [String],
      default: [],
    },
    sourceImageCount: {
      type: Number,
      default: 0,
    },
    responseText: {
      type: String,
    },
    created: {
      type: Number,
    },
    outputFormat: {
      type: String,
    },
    imageCount: {
      type: Number,
      default: 0,
    },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    favoritedAt: {
      type: Number,
      index: true,
    },
    favoriteImages: {
      type: [
        {
          imagePath: String,
          favoritedAt: Number,
        },
      ],
      default: [],
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'image_generations',
  },
);

module.exports =
  mongoose.models.ImageGeneration || mongoose.model('ImageGeneration', imageGenerationSchema);
