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

async function getFavoriteImageGenerations(user) {
  try {
    return await ImageGeneration.find({ user, isFavorite: true })
      .sort({ favoritedAt: -1, updatedAt: -1 })
      .lean();
  } catch (error) {
    logger.error('[getFavoriteImageGenerations] Error getting favorite image generations', error);
    throw error;
  }
}

async function setImageGenerationFavorite({ user, responseMessageId, isFavorite, favoritedAt }) {
  try {
    return await ImageGeneration.findOneAndUpdate(
      { user, responseMessageId },
      {
        $set: {
          isFavorite,
          ...(isFavorite ? { favoritedAt: favoritedAt ?? Date.now() } : {}),
        },
        ...(isFavorite ? {} : { $unset: { favoritedAt: '' } }),
      },
      { new: true },
    ).lean();
  } catch (error) {
    logger.error('[setImageGenerationFavorite] Error updating favorite state', error);
    throw error;
  }
}

module.exports = {
  saveImageGeneration,
  saveImageGenerationUsage,
  getFavoriteImageGenerations,
  setImageGenerationFavorite,
  ImageGeneration,
  ImageGenerationUsage,
};