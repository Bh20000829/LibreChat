const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  listModelPricingController,
  createModelPricingController,
  updateModelPricingController,
} = require('~/server/controllers/ModelPricingController');

const router = express.Router();

router.get('/', requireJwtAuth, checkAdmin, listModelPricingController);
router.post('/', requireJwtAuth, checkAdmin, createModelPricingController);
router.put('/:modelPricingId', requireJwtAuth, checkAdmin, updateModelPricingController);

module.exports = router;