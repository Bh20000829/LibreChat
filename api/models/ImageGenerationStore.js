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
    return await ImageGeneration.find({
      user,
      $or: [{ isFavorite: true }, { 'favoriteImages.0': { $exists: true } }],
    })
      .sort({ favoritedAt: -1, updatedAt: -1 })
      .lean();
  } catch (error) {
    logger.error('[getFavoriteImageGenerations] Error getting favorite image generations', error);
    throw error;
  }
}

async function setImageGenerationFavorite({
  user,
  responseMessageId,
  imagePath,
  isFavorite,
  favoritedAt,
}) {
  try {
    if (imagePath) {
      const doc = await ImageGeneration.findOne({ user, responseMessageId });
      if (!doc) {
        return null;
      }

      const existingFavorite = doc.favoriteImages.find((item) => item.imagePath === imagePath);
      if (isFavorite && existingFavorite) {
        existingFavorite.favoritedAt = favoritedAt ?? Date.now();
      } else if (isFavorite) {
        doc.favoriteImages.push({ imagePath, favoritedAt: favoritedAt ?? Date.now() });
      } else {
        doc.favoriteImages = doc.favoriteImages.filter((item) => item.imagePath !== imagePath);
      }

      if (isFavorite) {
        doc.favoritedAt = favoritedAt ?? Date.now();
      }

      await doc.save();
      return doc.toObject();
    }

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
