const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const mongoose = require('mongoose');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

function parseArgs(argv) {
  const result = {
    identifier: null,
    providerApiKey: null,
    groupType: null,
    clearKey: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--clear-key') {
      result.clearKey = true;
      continue;
    }

    if (arg.startsWith('--provider-key=')) {
      result.providerApiKey = arg.slice('--provider-key='.length);
      continue;
    }

    if (arg.startsWith('--group-type=')) {
      result.groupType = arg.slice('--group-type='.length);
      continue;
    }

    if (result.identifier == null) {
      result.identifier = arg;
      continue;
    }

    if (result.providerApiKey == null) {
      result.providerApiKey = arg;
      continue;
    }

    if (result.groupType == null) {
      result.groupType = arg;
    }
  }

  return result;
}

async function resolveUser(identifier) {
  const search = (identifier || '').trim();
  if (!search) {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(search)) {
    const byId = await User.findById(search).select('+providerApiKey');
    if (byId) {
      return byId;
    }
  }

  return await User.findOne({
    $or: [{ email: search.toLowerCase() }, { username: search }],
  }).select('+providerApiKey');
}

function normalizeGroupType(groupTypeInput) {
  if (groupTypeInput == null || groupTypeInput === '') {
    return null;
  }

  const parsed = Number(groupTypeInput);
  if (!Number.isInteger(parsed) || ![1, 2, 3].includes(parsed)) {
    return undefined;
  }

  return parsed;
}

(async () => {
  await connect();

  console.purple('--------------------------------------');
  console.purple('Set user provider key / group type');
  console.purple('--------------------------------------');

  const args = parseArgs(process.argv);

  if (!args.identifier) {
    console.orange(
      'Usage: npm run set-provider-key <email|username|userId> [providerApiKey] [groupType] [--clear-key] [--group-type=1|2|3] [--provider-key=***]',
    );
    args.identifier = await askQuestion('Email / Username / User ID:');
  }

  const user = await resolveUser(args.identifier);
  if (!user) {
    console.red('Error: User not found.');
    silentExit(1);
  }

  if (args.providerApiKey == null && !args.clearKey) {
    const keyInput = await askQuestion(
      'Provider API Key (留空表示不改；输入 "clear" 清空用户 key):',
    );
    if (keyInput.toLowerCase() === 'clear') {
      args.clearKey = true;
    } else if (keyInput.trim().length > 0) {
      args.providerApiKey = keyInput.trim();
    }
  }

  if (args.groupType == null) {
    args.groupType = await askQuestion('Group Type (1/2/3，留空表示不改，输入 0 清空):');
  }

  const normalizedGroupType = args.groupType === '0' ? null : normalizeGroupType(args.groupType);
  if (normalizedGroupType === undefined) {
    console.red('Error: groupType 只能是 1、2、3 或 0(清空)。');
    silentExit(1);
  }

  const updateOperation = { $set: {}, $unset: {} };

  if (args.clearKey) {
    updateOperation.$unset.providerApiKey = '';
  } else if (typeof args.providerApiKey === 'string' && args.providerApiKey.trim().length > 0) {
    updateOperation.$set.providerApiKey = args.providerApiKey.trim();
  }

  if (normalizedGroupType === null) {
    if (args.groupType === '0') {
      updateOperation.$unset.groupType = '';
    }
  } else {
    updateOperation.$set.groupType = normalizedGroupType;
  }

  if (Object.keys(updateOperation.$set).length === 0) {
    delete updateOperation.$set;
  }
  if (Object.keys(updateOperation.$unset).length === 0) {
    delete updateOperation.$unset;
  }

  if (!updateOperation.$set && !updateOperation.$unset) {
    console.yellow('未检测到更新内容，已跳过。');
    silentExit(0);
  }

  await User.updateOne({ _id: user._id }, updateOperation);

  const updated = await User.findById(user._id).select('+providerApiKey');
  console.green('用户更新成功');
  console.log(`ID: ${updated._id.toString()}`);
  console.log(`Email: ${updated.email}`);
  console.log(`Username: ${updated.username || 'N/A'}`);
  console.log(`Group Type: ${updated.groupType ?? 'N/A'}`);
  console.log(`Has Provider API Key: ${Boolean(updated.providerApiKey)}`);

  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
