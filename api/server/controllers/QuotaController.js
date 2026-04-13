const mongoose = require('mongoose');
const { User } = require('~/db/models');
const UserQuota = require('~/models/UserQuota');
const {
  ensureQuotaRecord,
  getBizDate,
  getBizMonth,
  getDefaultDailyQuotaCny,
  getDefaultQuotaCycleDays,
} = require('~/models/quotaUsage');

const normalizeDateInput = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
  if (!matched) {
    return null;
  }
  const [, year, month, day] = matched;
  return `${year}-${month}-${day}`;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const toPositiveInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const parseBizDate = (value) => {
  const normalized = normalizeDateInput(value);
  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const getDaysBetweenBizDates = (startDate, endDate) => {
  const start = parseBizDate(startDate);
  const end = parseBizDate(endDate);
  if (!start || !end) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86400000);
};

const ensureQuotaRecords = async (userIds) => {
  if (!userIds.length) {
    return;
  }

  const defaultDailyQuotaCny = getDefaultDailyQuotaCny();
  const bizDate = getBizDate();
  const bizMonth = getBizMonth();
  const defaultQuotaCycleDays = getDefaultQuotaCycleDays();
  const defaultQuotaStartDate = normalizeDateInput(process.env.QUOTA_START_DATE) || bizDate;
  const ops = userIds.map((userId) => ({
    updateOne: {
      filter: { user: userId },
      update: {
        $setOnInsert: {
          user: userId,
          dailyQuotaCny: defaultDailyQuotaCny,
          cycleQuotaCny: defaultDailyQuotaCny,
          remainingBalanceCny: defaultDailyQuotaCny,
          usedTodayCny: 0,
          usedCycleCny: 0,
          usedMonthCny: 0,
          lastMonthCny: 0,
          usedInputTokens: 0,
          usedOutputTokens: 0,
          bizDate,
          bizMonth,
          lastMonthBizMonth: null,
          lastResetBizDate: bizDate,
          quotaStartDate: defaultQuotaStartDate,
          quotaCycleDays: defaultQuotaCycleDays,
        },
      },
      upsert: true,
    },
  }));

  await UserQuota.bulkWrite(ops, { ordered: false });
};

const listUserQuotasController = async (_req, res) => {
  try {
    const users = await User.find({}, 'name username email role groupType createdAt').sort({ createdAt: -1 }).lean();
    const userIds = users.map((user) => user._id);

    await ensureQuotaRecords(userIds);

    const quotas = await UserQuota.find({ user: { $in: userIds } }).lean();
    const defaultQuotaStartDate = normalizeDateInput(process.env.QUOTA_START_DATE) || getBizDate();
    const defaultQuotaCycleDays = getDefaultQuotaCycleDays();

    const quotaMap = new Map(quotas.map((quota) => [String(quota.user), quota]));

    const result = users.map((user) => {
      const quota = quotaMap.get(String(user._id));
      const cycleQuotaCny = Math.max(
        0,
        Number(quota?.cycleQuotaCny ?? quota?.dailyQuotaCny ?? getDefaultDailyQuotaCny()),
      );
      const usedCycleCny = Math.max(0, Number(quota?.usedCycleCny ?? quota?.usedTodayCny ?? 0));
      const usedMonthCny = Math.max(0, Number(quota?.usedMonthCny ?? 0));
      const lastMonthCny = Math.max(0, Number(quota?.lastMonthCny ?? 0));
      const remainingBalanceCny = Math.max(0, Number(quota?.remainingBalanceCny ?? cycleQuotaCny));
      const usedInputTokens = Math.max(0, Math.floor(Number(quota?.usedInputTokens ?? 0)));
      const usedOutputTokens = Math.max(0, Math.floor(Number(quota?.usedOutputTokens ?? 0)));

      return {
        id: String(user._id),
        name: user.name || user.username || user.email,
        username: user.username || null,
        email: user.email,
        role: user.role,
        groupType: user.groupType ?? null,
        dailyQuotaCny: cycleQuotaCny,
        usedTodayCny: usedCycleCny,
        cycleQuotaCny,
        usedCycleCny,
        usedMonthCny,
        lastMonthCny,
        remainingBalanceCny,
        usedInputTokens,
        usedOutputTokens,
        bizDate: quota?.bizDate ?? getBizDate(),
        quotaStartDate: quota?.quotaStartDate ?? defaultQuotaStartDate,
        quotaCycleDays: Math.max(1, Math.floor(Number(quota?.quotaCycleDays ?? defaultQuotaCycleDays))),
        bizMonth: quota?.bizMonth ?? getBizMonth(),
        lastMonthBizMonth: quota?.lastMonthBizMonth ?? null,
        updatedAt: quota?.updatedAt ?? null,
      };
    });

    return res.status(200).json({ users: result });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list user quotas', error: error.message });
  }
};

const updateUserQuotaController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { dailyQuotaCny, cycleQuotaCny, quotaStartDate, quotaCycleDays } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentQuota = await ensureQuotaRecord(userId);
    const currentCycleQuota = toNonNegativeNumber(
      currentQuota?.cycleQuotaCny ?? currentQuota?.dailyQuotaCny,
      getDefaultDailyQuotaCny(),
    );
    const currentUsedCycle = toNonNegativeNumber(currentQuota?.usedCycleCny ?? currentQuota?.usedTodayCny, 0);
    const currentCycleDays = toPositiveInteger(currentQuota?.quotaCycleDays, getDefaultQuotaCycleDays());
    const currentStartDate = normalizeDateInput(currentQuota?.quotaStartDate) || getBizDate();

    const updates = {};
    let nextCycleQuota = currentCycleQuota;
    let nextCycleDays = currentCycleDays;
    let nextStartDate = currentStartDate;

    if (dailyQuotaCny != null || cycleQuotaCny != null) {
      const parsed = Number(cycleQuotaCny ?? dailyQuotaCny);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: 'cycleQuotaCny must be a non-negative number' });
      }
      nextCycleQuota = parsed;
      updates.dailyQuotaCny = parsed;
      updates.cycleQuotaCny = parsed;
    }

    if (quotaCycleDays != null) {
      const parsed = Number(quotaCycleDays);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return res.status(400).json({ message: 'quotaCycleDays must be an integer >= 1' });
      }
      nextCycleDays = Math.floor(parsed);
      updates.quotaCycleDays = nextCycleDays;
    }

    if (quotaStartDate != null) {
      const normalized = normalizeDateInput(quotaStartDate);
      if (!normalized) {
        return res.status(400).json({ message: 'quotaStartDate must be YYYY-MM-DD or YYYY/MM/DD' });
      }
      nextStartDate = normalized;
      updates.quotaStartDate = normalized;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    const startDateChanged = nextStartDate !== currentStartDate;
    const cycleDaysDecreased = nextCycleDays < currentCycleDays;
    const bizDate = getBizDate();
    const daysSinceStart = getDaysBetweenBizDates(currentStartDate, bizDate);
    const cycleDaysDecreaseReachedResetPoint = cycleDaysDecreased && daysSinceStart >= nextCycleDays;
    const shouldResetCycle = startDateChanged || cycleDaysDecreaseReachedResetPoint;

    updates.updatedBy = req.user?._id ?? req.user?.id;

    if (shouldResetCycle) {
      updates.usedTodayCny = 0;
      updates.usedCycleCny = 0;
      updates.usedInputTokens = 0;
      updates.usedOutputTokens = 0;
      updates.remainingBalanceCny = Math.max(0, nextCycleQuota);
      updates.bizDate = bizDate;
      updates.lastResetBizDate = bizDate;

      if (!startDateChanged) {
        updates.quotaStartDate = bizDate;
      }
    } else {
      updates.remainingBalanceCny = Math.max(0, nextCycleQuota - currentUsedCycle);
      updates.usedTodayCny = currentUsedCycle;
      updates.usedCycleCny = currentUsedCycle;
    }

    const updated = await UserQuota.findOneAndUpdate(
      { user: userId },
      { $set: updates, $setOnInsert: { user: userId } },
      { new: true, upsert: true },
    ).lean();

    const normalizedCycleQuotaCny = Math.max(
      0,
      Number(updated?.cycleQuotaCny ?? updated?.dailyQuotaCny ?? getDefaultDailyQuotaCny()),
    );
    const normalizedUsedCycleCny = Math.max(0, Number(updated?.usedCycleCny ?? updated?.usedTodayCny ?? 0));

    return res.status(200).json({
      id: String(updated.user),
      dailyQuotaCny: normalizedCycleQuotaCny,
      cycleQuotaCny: normalizedCycleQuotaCny,
      usedTodayCny: normalizedUsedCycleCny,
      usedCycleCny: normalizedUsedCycleCny,
      remainingBalanceCny: updated.remainingBalanceCny,
      quotaStartDate: updated.quotaStartDate,
      quotaCycleDays: Math.max(1, Math.floor(Number(updated.quotaCycleDays ?? getDefaultQuotaCycleDays()))),
      cycleResetApplied: shouldResetCycle,
      cycleResetReason: startDateChanged
        ? 'startDateChanged'
        : cycleDaysDecreaseReachedResetPoint
          ? 'cycleDaysDecreasedReachedResetPoint'
          : null,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update user quota', error: error.message });
  }
};

const getMyQuotaController = async (req, res) => {
  try {
    const userId = req.user?._id ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const quota = await ensureQuotaRecord(userId);

    const remainingBalanceCny = Math.max(0, Number(quota?.remainingBalanceCny ?? 0));

    return res.status(200).json({
      balance: remainingBalanceCny,
      remainingBalanceCny,
      dailyQuotaCny: Math.max(0, Number(quota?.cycleQuotaCny ?? quota?.dailyQuotaCny ?? getDefaultDailyQuotaCny())),
      usedTodayCny: Math.max(0, Number(quota?.usedCycleCny ?? quota?.usedTodayCny ?? 0)),
      cycleQuotaCny: Math.max(0, Number(quota?.cycleQuotaCny ?? quota?.dailyQuotaCny ?? getDefaultDailyQuotaCny())),
      usedCycleCny: Math.max(0, Number(quota?.usedCycleCny ?? quota?.usedTodayCny ?? 0)),
      quotaStartDate: quota?.quotaStartDate,
      quotaCycleDays: Math.max(1, Math.floor(Number(quota?.quotaCycleDays ?? getDefaultQuotaCycleDays()))),
      bizDate: quota?.bizDate ?? getBizDate(),
      updatedAt: quota?.updatedAt ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to get user quota', error: error.message });
  }
};

module.exports = {
  getMyQuotaController,
  listUserQuotasController,
  updateUserQuotaController,
};
