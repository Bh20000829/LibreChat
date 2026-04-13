const express = require('express');
const { requireJwtAuth, checkAdmin } = require('~/server/middleware');
const {
  listUsersController,
  createUserController,
  updateUserController,
  deleteUserController,
} = require('~/server/controllers/UserManagementController');

const router = express.Router();

router.get('/users', requireJwtAuth, checkAdmin, listUsersController);
router.post('/users', requireJwtAuth, checkAdmin, createUserController);
router.put('/users/:userId', requireJwtAuth, checkAdmin, updateUserController);
router.delete('/users/:userId', requireJwtAuth, checkAdmin, deleteUserController);

module.exports = router;
