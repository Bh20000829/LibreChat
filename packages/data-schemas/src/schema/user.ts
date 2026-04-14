import { Schema } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { IUser } from '~/types';

// Session sub-schema
const SessionSchema = new Schema(
  {
    /** 刷新令牌 */
    refreshToken: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

// Backup code sub-schema
const BackupCodeSchema = new Schema(
  {
    /** 备份码哈希 */
    codeHash: { type: String, required: true },
    /** 是否已使用 */
    used: { type: Boolean, default: false },
    /** 使用时间 */
    usedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    /** 昵称 */
    name: {
      type: String,
    },
    /** 用户名 */
    username: {
      type: String,
      lowercase: true,
      default: '',
    },
    /** 邮箱 */
    email: {
      type: String,
      required: [true, "can't be blank"],
      lowercase: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true,
    },
    /** 邮箱是否验证 */
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    /** 密码哈希 */
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 128,
      select: false,
    },
    /** 头像地址 */
    avatar: {
      type: String,
      required: false,
    },
    /** 登录提供方 */
    provider: {
      type: String,
      required: true,
      default: 'local',
    },
    /** 系统角色 */
    role: {
      type: String,
      default: SystemRoles.USER,
    },
    /** 分组类型（1/2/3） */
    groupType: {
      type: Number,
      enum: [1, 2, 3],
    },
    /** 用户自定义 API Key */
    providerApiKey: {
      type: String,
      trim: true,
      select: false,
    },
    /** 第三方账号 ID（Google） */
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（Facebook） */
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（OpenID） */
    openidId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（SAML） */
    samlId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（LDAP） */
    ldapId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（GitHub） */
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（Discord） */
    discordId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 第三方账号 ID（Apple） */
    appleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /** 插件配置 */
    plugins: {
      type: Array,
    },
    /** 是否启用双因子 */
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    /** TOTP 密钥 */
    totpSecret: {
      type: String,
      select: false,
    },
    /** 备份码列表 */
    backupCodes: {
      type: [BackupCodeSchema],
      select: false,
    },
    /** 刷新 token 列表 */
    refreshToken: {
      type: [SessionSchema],
    },
    /** 临时账号过期时间 */
    expiresAt: {
      type: Date,
      expires: 604800, // 7 days in seconds
    },
    /** 是否接受条款 */
    termsAccepted: {
      type: Boolean,
      default: false,
    },
    /** 个性化设置 */
    personalization: {
      type: {
        memories: {
          type: Boolean,
          default: true,
        },
      },
      default: {},
    },
    /** Field for external source identification (for consistency with TPrincipal schema) */
    idOnTheSource: {
      type: String,
      sparse: true,
    },
  },
  { timestamps: true },
);

export default userSchema;
