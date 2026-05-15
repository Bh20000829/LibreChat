const mongoose = require('mongoose');
const ImageModelPricing = require('~/models/ImageModelPricing');

const normalizeNumber = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
};

const listImageModelPricingController = async (_req, res) => {
  try {
    const records = await ImageModelPricing.find({}).sort({ modelName: 1 }).lean();

    return res.status(200).json({
      records: records.map((item) => ({
        id: String(item._id),
        modelName: item.modelName,
        textInputPrice: item.textInputPrice,
        cachePrice: item.cachePrice,
        textOutputPrice: item.textOutputPrice,
        imageInputPrice: item.imageInputPrice,
        imageOutputPrice: item.imageOutputPrice,
        multiplier: item.multiplier,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: 'Failed to list image model pricing', error: error.message });
  }
};

const createImageModelPricingController = async (req, res) => {
  try {
    const {
      modelName,
      textInputPrice,
      cachePrice,
      textOutputPrice,
      imageInputPrice,
      imageOutputPrice,
      multiplier,
    } = req.body || {};

    if (!modelName || typeof modelName !== 'string' || modelName.trim().length === 0) {
      return res.status(400).json({ message: 'modelName is required' });
    }

    const payload = {
      modelName: modelName.trim(),
      textInputPrice: normalizeNumber(textInputPrice, 'textInputPrice'),
      cachePrice: normalizeNumber(cachePrice ?? 0, 'cachePrice'),
      textOutputPrice: normalizeNumber(textOutputPrice, 'textOutputPrice'),
      imageInputPrice: normalizeNumber(imageInputPrice, 'imageInputPrice'),
      imageOutputPrice: normalizeNumber(imageOutputPrice, 'imageOutputPrice'),
      multiplier: normalizeNumber(multiplier, 'multiplier'),
      createdBy: req.user?._id ?? req.user?.id,
      updatedBy: req.user?._id ?? req.user?.id,
    };

    const created = await ImageModelPricing.create(payload);

    return res.status(201).json({
      id: String(created._id),
      modelName: created.modelName,
      textInputPrice: created.textInputPrice,
      cachePrice: created.cachePrice,
      textOutputPrice: created.textOutputPrice,
      imageInputPrice: created.imageInputPrice,
      imageOutputPrice: created.imageOutputPrice,
      multiplier: created.multiplier,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'modelName already exists' });
    }
    if (error.message?.includes('must be a non-negative number')) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: 'Failed to create image model pricing', error: error.message });
  }
};

const updateImageModelPricingController = async (req, res) => {
  try {
    const { imageModelPricingId } = req.params;
    const {
      modelName,
      textInputPrice,
      cachePrice,
      textOutputPrice,
      imageInputPrice,
      imageOutputPrice,
      multiplier,
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(imageModelPricingId)) {
      return res.status(400).json({ message: 'Invalid imageModelPricingId' });
    }

    const updates = {};

    if (modelName != null) {
      if (typeof modelName !== 'string' || modelName.trim().length === 0) {
        return res.status(400).json({ message: 'modelName must be a non-empty string' });
      }
      updates.modelName = modelName.trim();
    }

    if (textInputPrice != null) {
      updates.textInputPrice = normalizeNumber(textInputPrice, 'textInputPrice');
    }

    if (cachePrice != null) {
      updates.cachePrice = normalizeNumber(cachePrice, 'cachePrice');
    }

    if (textOutputPrice != null) {
      updates.textOutputPrice = normalizeNumber(textOutputPrice, 'textOutputPrice');
    }

    if (imageInputPrice != null) {
      updates.imageInputPrice = normalizeNumber(imageInputPrice, 'imageInputPrice');
    }

    if (imageOutputPrice != null) {
      updates.imageOutputPrice = normalizeNumber(imageOutputPrice, 'imageOutputPrice');
    }

    if (multiplier != null) {
      updates.multiplier = normalizeNumber(multiplier, 'multiplier');
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    updates.updatedBy = req.user?._id ?? req.user?.id;

    const updated = await ImageModelPricing.findByIdAndUpdate(
      imageModelPricingId,
      { $set: updates },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Image model pricing not found' });
    }

    return res.status(200).json({
      id: String(updated._id),
      modelName: updated.modelName,
      textInputPrice: updated.textInputPrice,
      cachePrice: updated.cachePrice,
      textOutputPrice: updated.textOutputPrice,
      imageInputPrice: updated.imageInputPrice,
      imageOutputPrice: updated.imageOutputPrice,
      multiplier: updated.multiplier,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'modelName already exists' });
    }
    if (error.message?.includes('must be a non-negative number')) {
      return res.status(400).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: 'Failed to update image model pricing', error: error.message });
  }
};

const deleteImageModelPricingController = async (req, res) => {
  try {
    const { imageModelPricingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(imageModelPricingId)) {
      return res.status(400).json({ message: 'Invalid imageModelPricingId' });
    }

    const deleted = await ImageModelPricing.findByIdAndDelete(imageModelPricingId).lean();
    if (!deleted) {
      return res.status(404).json({ message: 'Image model pricing not found' });
    }

    return res.status(200).json({
      id: String(deleted._id),
      modelName: deleted.modelName,
      message: 'Image model pricing deleted',
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: 'Failed to delete image model pricing', error: error.message });
  }
};

module.exports = {
  listImageModelPricingController,
  createImageModelPricingController,
  updateImageModelPricingController,
  deleteImageModelPricingController,
};
