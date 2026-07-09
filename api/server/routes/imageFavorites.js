const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getFavoriteImageGenerations,
  setImageGenerationFavorite,
} = require('~/models/ImageGenerationStore');

const router = express.Router();

router.use(requireJwtAuth);

function getAssetImagePath(asset) {
  return asset?.filepath ?? asset?.url ?? asset?.imagePath ?? null;
}

function getFavoriteId(messageId, imagePath) {
  return `${messageId}::${encodeURIComponent(imagePath)}`;
}

function parseFavoriteId(favoriteId) {
  const [messageId, encodedImagePath] = String(favoriteId ?? '').split('::');
  return {
    messageId,
    imagePath: encodedImagePath ? decodeURIComponent(encodedImagePath) : null,
  };
}

function mapAssetFavorite(doc, asset, favoritedAt) {
  const imagePath = getAssetImagePath(asset);
  if (!imagePath) {
    return null;
  }

  return {
    id: getFavoriteId(doc.responseMessageId, imagePath),
    messageId: doc.responseMessageId,
    conversationId: doc.conversationId,
    imagePath,
    prompt: doc.prompt ?? '',
    altText: asset?.filename ?? 'Generated Image',
    width: asset?.width,
    height: asset?.height,
    model: doc.model,
    favoritedAt: favoritedAt ?? Date.now(),
  };
}

router.get('/', async (req, res) => {
  try {
    const favorites = await getFavoriteImageGenerations(req.user.id);
    const mappedFavorites = favorites
      .flatMap((doc) => {
        const assets = Array.isArray(doc?.providerResponse?.data) ? doc.providerResponse.data : [];
        const assetByPath = new Map(assets.map((asset) => [getAssetImagePath(asset), asset]));
        const imageFavorites = Array.isArray(doc?.favoriteImages)
          ? doc.favoriteImages
              .map((favorite) =>
                mapAssetFavorite(
                  doc,
                  assetByPath.get(favorite.imagePath) ?? { filepath: favorite.imagePath },
                  favorite.favoritedAt,
                ),
              )
              .filter(Boolean)
          : [];

        if (imageFavorites.length > 0) {
          return imageFavorites;
        }

        if (!doc.isFavorite || assets.length === 0) {
          return [];
        }

        return [mapAssetFavorite(doc, assets[0], doc.favoritedAt)].filter(Boolean);
      })
      .sort((a, b) => Number(b.favoritedAt ?? 0) - Number(a.favoritedAt ?? 0));

    res.status(200).json(mappedFavorites);
  } catch (error) {
    logger.error('Error getting image favorites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { messageId, imagePath, favoritedAt } = req.body || {};

  if (!messageId) {
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    const favorite = await setImageGenerationFavorite({
      user: req.user.id,
      responseMessageId: messageId,
      imagePath,
      isFavorite: true,
      favoritedAt,
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Image generation not found' });
    }

    const asset = Array.isArray(favorite?.providerResponse?.data)
      ? (favorite.providerResponse.data.find((item) => getAssetImagePath(item) === imagePath) ??
        favorite.providerResponse.data[0])
      : { filepath: imagePath };

    res.status(200).json(mapAssetFavorite(favorite, asset, favoritedAt));
  } catch (error) {
    logger.error('Error saving image favorite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:favoriteId', async (req, res) => {
  try {
    const { messageId, imagePath } = parseFavoriteId(req.params.favoriteId);
    const favorite = await setImageGenerationFavorite({
      user: req.user.id,
      responseMessageId: messageId,
      imagePath,
      isFavorite: false,
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.status(200).json({ id: decodeURIComponent(req.params.favoriteId), removed: true });
  } catch (error) {
    logger.error('Error deleting image favorite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
