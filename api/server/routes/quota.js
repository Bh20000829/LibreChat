const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  getMyQuotaController,
  listUserQuotasController,
  updateUserQuotaController,
} = require('~/server/controllers/QuotaController');

const router = express.Router();

router.get('/me', requireJwtAuth, getMyQuotaController);
router.get('/users', requireJwtAuth, checkAdmin, listUserQuotasController);
router.put('/users/:userId', requireJwtAuth, checkAdmin, updateUserQuotaController);

module.exports = router;
