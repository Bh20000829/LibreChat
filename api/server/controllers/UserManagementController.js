const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { logger } = require('@librechat/data-schemas');
const {
  getFiles,
  deleteFiles,
  deleteConvos,
  deletePresets,
  deleteMessages,
  deleteUserById,
  deleteAllSharedLinks,
  deleteAllUserSessions,
  findUser,
} = require('~/models');
const { registerUser } = require('~/server/services/AuthService');
const { deleteUserPluginAuth } = require('~/server/services/PluginService');
const { deleteUserKey, invalidateUserKeyRoutingCache } = require('~/server/services/UserService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { deleteToolCalls } = require('~/models/ToolCall');
const { Transaction, Balance, User, Token, Agent, Assistant, ConversationTag, Key, MemoryEntry, Prompt, PromptGroup, Session } = require('~/db/models');

const normalizeGroupType = (groupTypeInput) => {
  if (groupTypeInput == null || groupTypeInput === '') {
    return null;
  }

  const parsed = Number(groupTypeInput);
  if (!Number.isInteger(parsed) || ![1, 2, 3].includes(parsed)) {
    return undefined;
  }

  return parsed;
};

const sanitizeUser = (user) => ({
  id: String(user._id ?? user.id),
  name: user.name || '',
  email: user.email || '',
  groupType: user.groupType ?? null,
  providerApiKey: user.providerApiKey || '',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const randomPassword = () => Math.random().toString(36).slice(-18);

const listUsersController = async (_req, res) => {
  try {
    const users = await User.find({}, 'name username email groupType createdAt updatedAt')
      .select('+providerApiKey')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ users: users.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list users', error: error.message });
  }
};

const createUserController = async (req, res) => {
  try {
    const { email, name, password, groupType, providerApiKey } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existingByEmail = await findUser({ email: trimmedEmail }, 'email _id');
    if (existingByEmail) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const emailPrefix = trimmedEmail.split('@')[0] || 'user';
    const finalName = (typeof name === 'string' && name.trim()) || emailPrefix;
    const finalUsername = finalName;
    if (typeof password !== 'string' || password.trim().length < 8) {
      return res.status(400).json({ message: 'password is required and must be at least 8 characters' });
    }
    const finalPassword = password.trim();
    const normalizedGroupType = normalizeGroupType(groupType);
    if (normalizedGroupType === undefined) {
      return res.status(400).json({ message: 'groupType must be 1, 2, or 3' });
    }

    const existingByUsername = await User.findOne({ username: finalUsername }).select('_id').lean();
    if (existingByUsername) {
      return res.status(409).json({ message: 'username already exists' });
    }

    const result = await registerUser(
      {
        email: trimmedEmail,
        password: finalPassword,
        confirm_password: finalPassword,
        name: finalName,
        username: finalUsername,
      },
      {
        emailVerified: true,
      },
    );

    if (result.status !== 200) {
      return res.status(result.status || 500).json({ message: result.message || 'Failed to create user' });
    }

    let created = await User.findOne({ email: trimmedEmail }).select('+providerApiKey').lean();
    if (!created) {
      return res.status(500).json({ message: 'User creation completed but user not found' });
    }

    const createUpdates = {};
    if (normalizedGroupType != null) {
      createUpdates.groupType = normalizedGroupType;
    }
    if (typeof providerApiKey === 'string') {
      createUpdates.providerApiKey = providerApiKey.trim();
    }

    if (Object.keys(createUpdates).length > 0) {
      created = await User.findByIdAndUpdate(created._id, { $set: createUpdates }, { new: true })
        .select('+providerApiKey')
        .lean();
    }

    invalidateUserKeyRoutingCache(created._id);

    return res.status(201).json({
      user: sanitizeUser(created),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create user', error: error.message });
  }
};

const updateUserController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, password, groupType, providerApiKey } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const existing = await User.findById(userId).select('+providerApiKey').lean();
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updates = {};

    if (name != null) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'name must be a non-empty string' });
      }
      const normalizedName = name.trim();
      const duplicate = await User.findOne({ username: normalizedName, _id: { $ne: userId } })
        .select('_id')
        .lean();
      if (duplicate) {
        return res.status(409).json({ message: 'username already exists' });
      }
      updates.name = normalizedName;
      updates.username = normalizedName;
    }

    if (email != null) {
      if (typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ message: 'email must be valid' });
      }
      const normalized = email.trim().toLowerCase();
      const duplicate = await User.findOne({ email: normalized, _id: { $ne: userId } })
        .select('_id')
        .lean();
      if (duplicate) {
        return res.status(409).json({ message: 'email already exists' });
      }
      updates.email = normalized;
    }

    if (password != null && String(password).trim().length > 0) {
      if (String(password).trim().length < 8) {
        return res.status(400).json({ message: 'password must be at least 8 characters' });
      }
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(String(password).trim(), salt);
      updates.passwordVersion = Date.now();
    }

    if (groupType !== undefined) {
      const normalizedGroupType = normalizeGroupType(groupType);
      if (normalizedGroupType === undefined) {
        return res.status(400).json({ message: 'groupType must be 1, 2, or 3' });
      }
      updates.groupType = normalizedGroupType;
    }

    if (providerApiKey !== undefined) {
      if (providerApiKey == null) {
        updates.providerApiKey = '';
      } else if (typeof providerApiKey === 'string') {
        updates.providerApiKey = providerApiKey.trim();
      } else {
        return res.status(400).json({ message: 'providerApiKey must be a string' });
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    const updated = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('+providerApiKey')
      .lean();
    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    invalidateUserKeyRoutingCache(userId);

    return res.status(200).json({ user: sanitizeUser(updated) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update user', error: error.message });
  }
};

const deleteUserFiles = async (req, userId) => {
  try {
    const userFiles = await getFiles({ user: userId });
    await processDeleteRequest({ req, files: userFiles });
  } catch (error) {
    logger.error('[deleteUserFiles]', error);
  }
};

const deleteUserController = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    if (String(req.user?._id ?? req.user?.id) === String(userId)) {
      return res.status(400).json({ message: 'Cannot delete current logged-in admin user' });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const uid = String(user._id);

    await deleteMessages({ user: uid });
    await deleteAllUserSessions({ userId: uid });
    await Transaction.deleteMany({ user: uid });
    await deleteUserKey({ userId: uid, all: true });
    await Balance.deleteMany({ user: uid });
    await deletePresets(uid);
    try {
      await deleteConvos(uid);
    } catch (error) {
      logger.error('[deleteUserController] Error deleting user conversations', error);
    }
    await deleteUserPluginAuth(uid, null, true);
    await deleteAllSharedLinks(uid);
    await deleteToolCalls(uid);

    await Promise.all([
      Agent.deleteMany({ author: uid }),
      Assistant.deleteMany({ user: uid }),
      ConversationTag.deleteMany({ user: uid }),
      Key.deleteMany({ userId: uid }),
      MemoryEntry.deleteMany({ userId: uid }),
      Prompt.deleteMany({ author: uid }),
      PromptGroup.deleteMany({ author: uid }),
      Session.deleteMany({ user: uid }),
      Token.deleteMany({ userId: uid }),
    ]);

    await deleteUserFiles(req, uid);
    await deleteFiles(null, uid);
    await deleteUserById(uid);

    invalidateUserKeyRoutingCache(uid);

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
};

module.exports = {
  listUsersController,
  createUserController,
  updateUserController,
  deleteUserController,
};
