const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  listImageModelPricingController,
  createImageModelPricingController,
  updateImageModelPricingController,
  deleteImageModelPricingController,
} = require('~/server/controllers/ImageModelPricingController');

const router = express.Router();

router.get('/', requireJwtAuth, checkAdmin, listImageModelPricingController);
router.post('/', requireJwtAuth, checkAdmin, createImageModelPricingController);
router.put('/:imageModelPricingId', requireJwtAuth, checkAdmin, updateImageModelPricingController);
router.delete('/:imageModelPricingId', requireJwtAuth, checkAdmin, deleteImageModelPricingController);

module.exports = router;
