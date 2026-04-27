const mongoose = require('mongoose');

const userQuotaSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    dailyQuotaCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    cycleQuotaCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    remainingBalanceCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedTodayCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedCycleCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedMonthCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastMonthCny: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedInputTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedOutputTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    usedCacheTokens: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    bizDate: {
      type: String,
      required: false,
    },
    bizMonth: {
      type: String,
      required: false,
    },
    lastMonthBizMonth: {
      type: String,
      required: false,
    },
    lastResetBizDate: {
      type: String,
      required: false,
    },
    quotaStartDate: {
      type: String,
      required: false,
    },
    quotaCycleDays: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.models.UserQuota || mongoose.model('UserQuota', userQuotaSchema);
