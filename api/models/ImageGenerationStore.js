const { logger } = require('@librechat/data-schemas');
const ImageGeneration = require('./ImageGeneration');
const ImageGenerationUsage = require('./ImageGenerationUsage');

async function saveImageGeneration(data) {
  try {
    const doc = await ImageGeneration.findOneAndUpdate(
      { responseMessageId: data.responseMessageId },
      data,
      { upsert: true, new: true },
    ).lean();

    return doc;
  } catch (error) {
    logger.error('[saveImageGeneration] Error saving image generation', error);
    throw error;
  }
}

async function saveImageGenerationUsage(data) {
  try {
    const doc = await ImageGenerationUsage.findOneAndUpdate(
      { responseMessageId: data.responseMessageId },
      data,
      { upsert: true, new: true },
    ).lean();

    return doc;
  } catch (error) {
    logger.error('[saveImageGenerationUsage] Error saving image generation usage', error);
    throw error;
  }
}

module.exports = {
  saveImageGeneration,
  saveImageGenerationUsage,
  ImageGeneration,
  ImageGenerationUsage,
};