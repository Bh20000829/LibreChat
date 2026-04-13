const UserQuota = require('~/models/UserQuota');

const getDefaultDailyQuotaCny = () => {
  const primary = Number(process.env.DAILY_QUOTA_CNY);
  if (Number.isFinite(primary) && primary >= 0) {
    return primary;
  }

  const fallback = Number(process.env.START_BALANCE);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
};

const getDefaultQuotaCycleDays = () => {
  const parsed = Number(process.env.QUOTA_CYCLE_DAYS);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
};

const roundMoney8 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round((parsed + Number.EPSILON) * 100000000) / 100000000;
};

const BIZ_TIME_ZONE = 'Asia/Shanghai';

const getBizFormatter = (options) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BIZ_TIME_ZONE,
    ...options,
  });

const getBizDate = () => {
  const now = new Date();
  const fmt = getBizFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
};

const getBizMonth = () => {
  const now = new Date();
  const fmt = getBizFormatter({
    year: 'numeric',
    month: '2-digit',
  });
  const [year, month] = fmt.format(now).split('-');
  return `${year}-${month}`;
};

const normalizeBizDateString = (value) => {
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

const parseBizDate = (value) => {
  const normalized = normalizeBizDateString(value);
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

const formatUtcDateToBiz = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToBizDate = (bizDate, days) => {
  const parsed = parseBizDate(bizDate);
  if (!parsed) {
    return bizDate;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatUtcDateToBiz(parsed) || bizDate;
};

const getDaysBetweenBizDates = (startDate, endDate) => {
  const start = parseBizDate(startDate);
  const end = parseBizDate(endDate);
  if (!start || !end) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86400000);
};

const getNextResetBizDate = (quota) => {
  const bizDate = getBizDate();
  const defaultQuotaCycleDays = getDefaultQuotaCycleDays();
  const defaultQuotaStartDate = normalizeBizDateString(process.env.QUOTA_START_DATE) || bizDate;

  const quotaStartDate = normalizeBizDateString(quota?.quotaStartDate) || defaultQuotaStartDate;
  const quotaCycleDays = Math.max(1, Math.floor(Number(quota?.quotaCycleDays) || defaultQuotaCycleDays));
  const daysSinceStart = getDaysBetweenBizDates(quotaStartDate, bizDate);

  if (daysSinceStart < 0) {
    return quotaStartDate;
  }

  const cyclesElapsed = Math.floor(daysSinceStart / quotaCycleDays);
  const currentCycleStart = addDaysToBizDate(quotaStartDate, cyclesElapsed * quotaCycleDays);
  return addDaysToBizDate(currentCycleStart, quotaCycleDays);
};

const ensureQuotaRecord = async (user) => {
  const bizDate = getBizDate();
  const bizMonth = getBizMonth();
  const defaultDailyQuotaCny = getDefaultDailyQuotaCny();
  const defaultQuotaCycleDays = getDefaultQuotaCycleDays();
  const defaultQuotaStartDate = normalizeBizDateString(process.env.QUOTA_START_DATE) || bizDate;

  let quota = await UserQuota.findOne({ user }).lean();
  if (!quota) {
    quota = await UserQuota.findOneAndUpdate(
      { user },
      {
        $setOnInsert: {
          user,
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
      { upsert: true, new: true },
    ).lean();
    return quota;
  }

  if (
    quota.dailyQuotaCny == null ||
    quota.cycleQuotaCny == null ||
    quota.remainingBalanceCny == null ||
    quota.usedTodayCny == null ||
    quota.usedCycleCny == null ||
    quota.usedMonthCny == null ||
    quota.lastMonthCny == null ||
    quota.usedInputTokens == null ||
    quota.usedOutputTokens == null ||
    quota.quotaCycleDays == null
  ) {
    const cycleQuotaCny =
      quota.cycleQuotaCny == null
        ? quota.dailyQuotaCny == null
          ? getDefaultDailyQuotaCny()
          : Number(quota.dailyQuotaCny) || 0
        : Number(quota.cycleQuotaCny) || 0;
    const usedCycleCny =
      quota.usedCycleCny == null
        ? quota.usedTodayCny == null
          ? 0
          : Number(quota.usedTodayCny) || 0
        : Number(quota.usedCycleCny) || 0;

    quota = await UserQuota.findOneAndUpdate(
      { user },
      {
        $set: {
          dailyQuotaCny: cycleQuotaCny,
          cycleQuotaCny,
          remainingBalanceCny:
            quota.remainingBalanceCny == null
              ? roundMoney8(Math.max(0, cycleQuotaCny - usedCycleCny))
              : Number(quota.remainingBalanceCny) || 0,
          usedTodayCny: usedCycleCny,
          usedCycleCny,
          usedMonthCny: quota.usedMonthCny == null ? 0 : Number(quota.usedMonthCny) || 0,
          lastMonthCny: quota.lastMonthCny == null ? 0 : Number(quota.lastMonthCny) || 0,
          usedInputTokens:
            quota.usedInputTokens == null ? 0 : Math.max(0, Math.floor(Number(quota.usedInputTokens) || 0)),
          usedOutputTokens:
            quota.usedOutputTokens == null ? 0 : Math.max(0, Math.floor(Number(quota.usedOutputTokens) || 0)),
          bizMonth: quota.bizMonth || bizMonth,
          lastMonthBizMonth: quota.lastMonthBizMonth || null,
          quotaStartDate: normalizeBizDateString(quota.quotaStartDate) || defaultQuotaStartDate,
          quotaCycleDays:
            quota.quotaCycleDays == null
              ? defaultQuotaCycleDays
              : Math.max(1, Math.floor(Number(quota.quotaCycleDays) || 1)),
        },
      },
      { new: true },
    ).lean();
  }

  if (quota.bizMonth !== bizMonth) {
    quota = await UserQuota.findOneAndUpdate(
      { user },
      {
        $set: {
          lastMonthCny: roundMoney8(Math.max(0, Number(quota.usedMonthCny || 0))),
          lastMonthBizMonth: quota.bizMonth || null,
          usedMonthCny: 0,
          bizMonth,
        },
      },
      { new: true },
    ).lean();
  }

  const quotaStartDate = normalizeBizDateString(quota.quotaStartDate) || defaultQuotaStartDate;
  const quotaCycleDays = Math.max(1, Math.floor(Number(quota.quotaCycleDays) || defaultQuotaCycleDays));
  const cycleQuotaCny = Math.max(0, Number(quota.cycleQuotaCny ?? quota.dailyQuotaCny ?? defaultDailyQuotaCny));
  const daysSinceStart = getDaysBetweenBizDates(quotaStartDate, bizDate);

  if (daysSinceStart >= quotaCycleDays) {
    const cyclesToAdvance = Math.floor(daysSinceStart / quotaCycleDays);
    const nextQuotaStartDate = addDaysToBizDate(quotaStartDate, cyclesToAdvance * quotaCycleDays);

    quota = await UserQuota.findOneAndUpdate(
      { user },
      {
        $set: {
          usedTodayCny: 0,
          usedCycleCny: 0,
          usedInputTokens: 0,
          usedOutputTokens: 0,
          remainingBalanceCny: roundMoney8(Math.max(0, cycleQuotaCny)),
          bizDate,
          dailyQuotaCny: cycleQuotaCny,
          cycleQuotaCny,
          quotaStartDate: nextQuotaStartDate,
          quotaCycleDays,
          lastResetBizDate: bizDate,
        },
      },
      { new: true },
    ).lean();
  } else if (quota.bizDate !== bizDate) {
    quota = await UserQuota.findOneAndUpdate(
      { user },
      {
        $set: {
          bizDate,
          dailyQuotaCny: cycleQuotaCny,
          cycleQuotaCny,
          usedTodayCny: Math.max(0, Number(quota.usedCycleCny ?? quota.usedTodayCny ?? 0)),
        },
      },
      { new: true },
    ).lean();
  }

  return quota;
};

const incrementQuotaUsage = async (user, usage) => {
  const inputTokens = Math.max(0, Math.floor(Number(usage?.inputTokens) || 0));
  const outputTokens = Math.max(0, Math.floor(Number(usage?.outputTokens) || 0));
  const costCnyRaw = Number(usage?.costCny);
  const costCny = Number.isFinite(costCnyRaw) && costCnyRaw > 0 ? roundMoney8(costCnyRaw) : 0;

  if (inputTokens === 0 && outputTokens === 0 && costCny === 0) {
    return;
  }

  const quota = await ensureQuotaRecord(user);
  const currentRemaining = Math.max(0, Number(quota?.remainingBalanceCny ?? 0));
  const nextRemaining = roundMoney8(Math.max(0, currentRemaining - costCny));
  const nextUsedCycle = roundMoney8(
    Math.max(0, Number(quota?.usedCycleCny ?? quota?.usedTodayCny ?? 0)) + costCny,
  );
  const nextUsedMonth = roundMoney8(Math.max(0, Number(quota?.usedMonthCny ?? 0)) + costCny);
  const nextInputTokens = Math.max(0, Math.floor(Number(quota?.usedInputTokens ?? 0)) + inputTokens);
  const nextOutputTokens = Math.max(0, Math.floor(Number(quota?.usedOutputTokens ?? 0)) + outputTokens);

  await UserQuota.findOneAndUpdate(
    { user },
    {
      $set: {
        usedInputTokens: nextInputTokens,
        usedOutputTokens: nextOutputTokens,
        usedTodayCny: nextUsedCycle,
        usedCycleCny: nextUsedCycle,
        usedMonthCny: nextUsedMonth,
        remainingBalanceCny: nextRemaining,
      },
    },
  );
};

module.exports = {
  getBizDate,
  getBizMonth,
  getDefaultDailyQuotaCny,
  getDefaultQuotaCycleDays,
  getNextResetBizDate,
  ensureQuotaRecord,
  incrementQuotaUsage,
};
