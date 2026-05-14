const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getFavoriteImageGenerations,
  setImageGenerationFavorite,
} = require('~/models/ImageGenerationStore');

const router = express.Router();

router.use(requireJwtAuth);

function mapFavorite(doc) {
  const asset = Array.isArray(doc?.providerResponse?.data) ? doc.providerResponse.data[0] : null;
  const imagePath = asset?.filepath ?? asset?.url ?? null;

  return {
    id: doc.responseMessageId,
    messageId: doc.responseMessageId,
    conversationId: doc.conversationId,
    imagePath,
    prompt: doc.prompt ?? '',
    altText: asset?.filename ?? 'Generated Image',
    width: asset?.width,
    height: asset?.height,
    model: doc.model,
    favoritedAt: doc.favoritedAt ?? Date.now(),
  };
}

router.get('/', async (req, res) => {
  try {
    const favorites = await getFavoriteImageGenerations(req.user.id);
    res.status(200).json(favorites.map(mapFavorite).filter((favorite) => !!favorite.imagePath));
  } catch (error) {
    logger.error('Error getting image favorites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  const { messageId, favoritedAt } = req.body || {};

  if (!messageId) {
    return res.status(400).json({ error: 'messageId is required' });
  }

  try {
    const favorite = await setImageGenerationFavorite({
      user: req.user.id,
      responseMessageId: messageId,
      isFavorite: true,
      favoritedAt,
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Image generation not found' });
    }

    res.status(200).json(mapFavorite(favorite));
  } catch (error) {
    logger.error('Error saving image favorite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:favoriteId', async (req, res) => {
  try {
    const favorite = await setImageGenerationFavorite({
      user: req.user.id,
      responseMessageId: decodeURIComponent(req.params.favoriteId),
      isFavorite: false,
    });

    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }

    res.status(200).json({ id: favorite.responseMessageId, removed: true });
  } catch (error) {
    logger.error('Error deleting image favorite:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;