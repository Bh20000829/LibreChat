const mongoose = require('mongoose');
const ModelPricing = require('~/models/ModelPricing');

const normalizeNumber = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return parsed;
};

const listModelPricingController = async (_req, res) => {
  try {
    const records = await ModelPricing.find({}).sort({ modelName: 1 }).lean();

    return res.status(200).json({
      records: records.map((item) => ({
        id: String(item._id),
        modelName: item.modelName,
        inputPrice: item.inputPrice,
        outputPrice: item.outputPrice,
        multiplier: item.multiplier,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list model pricing', error: error.message });
  }
};

const createModelPricingController = async (req, res) => {
  try {
    const { modelName, inputPrice, outputPrice, multiplier } = req.body || {};

    if (!modelName || typeof modelName !== 'string' || modelName.trim().length === 0) {
      return res.status(400).json({ message: 'modelName is required' });
    }

    const payload = {
      modelName: modelName.trim(),
      inputPrice: normalizeNumber(inputPrice, 'inputPrice'),
      outputPrice: normalizeNumber(outputPrice, 'outputPrice'),
      multiplier: normalizeNumber(multiplier, 'multiplier'),
      createdBy: req.user?._id ?? req.user?.id,
      updatedBy: req.user?._id ?? req.user?.id,
    };

    const created = await ModelPricing.create(payload);

    return res.status(201).json({
      id: String(created._id),
      modelName: created.modelName,
      inputPrice: created.inputPrice,
      outputPrice: created.outputPrice,
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
    return res.status(500).json({ message: 'Failed to create model pricing', error: error.message });
  }
};

const updateModelPricingController = async (req, res) => {
  try {
    const { modelPricingId } = req.params;
    const { modelName, inputPrice, outputPrice, multiplier } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(modelPricingId)) {
      return res.status(400).json({ message: 'Invalid modelPricingId' });
    }

    const updates = {};

    if (modelName != null) {
      if (typeof modelName !== 'string' || modelName.trim().length === 0) {
        return res.status(400).json({ message: 'modelName must be a non-empty string' });
      }
      updates.modelName = modelName.trim();
    }

    if (inputPrice != null) {
      updates.inputPrice = normalizeNumber(inputPrice, 'inputPrice');
    }

    if (outputPrice != null) {
      updates.outputPrice = normalizeNumber(outputPrice, 'outputPrice');
    }

    if (multiplier != null) {
      updates.multiplier = normalizeNumber(multiplier, 'multiplier');
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    updates.updatedBy = req.user?._id ?? req.user?.id;

    const updated = await ModelPricing.findByIdAndUpdate(
      modelPricingId,
      { $set: updates },
      { new: true },
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Model pricing not found' });
    }

    return res.status(200).json({
      id: String(updated._id),
      modelName: updated.modelName,
      inputPrice: updated.inputPrice,
      outputPrice: updated.outputPrice,
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
    return res.status(500).json({ message: 'Failed to update model pricing', error: error.message });
  }
};

module.exports = {
  listModelPricingController,
  createModelPricingController,
  updateModelPricingController,
};