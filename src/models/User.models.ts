// // src/models/User.ts
// import mongoose, { Document, Schema } from "mongoose";

// export interface IUser extends Document {
//   email?: string;
//   passwordHash?: string;
//   walletAddress?: string;
//   nonce?: string;
//   token?: number;
//   lastSpinAt?: Date;
//   createdAt: Date;
//   updatedAt: Date;
//   telegramId: number;
//   telegramFirstName?: string;
//   telegramLastName?: string;
//   telegramUsername?: string;
//   walletConnected: boolean;

//   telegramPhotoUrl?: string;
// }

// const UserSchema = new Schema<IUser>(
//   {
//     email: { type: String, unique: true, sparse: true },
//     passwordHash: { type: String },
//     walletAddress: { type: String, unique: true, sparse: true },
//     nonce: { type: String },
//     token: { type: Number, default: 0 },
//     lastSpinAt: { type: Date, default: null },
//     telegramId: { type: Number, required: true, unique: true },
//     telegramFirstName: { type: String },
//     telegramLastName: { type: String },
//     telegramUsername: { type: String },
//     telegramPhotoUrl: { type: String },
//     walletConnected: { type: Boolean, default: false },
//   },
//   { timestamps: true }
// );

// export const User = mongoose.model<IUser>("newuser", UserSchema);

// src/models/User.ts
import mongoose, { Document, Schema } from "mongoose";
export interface IUser extends Document {
  fullName?: string;
  email?: string;
  passwordHash?: string;
  walletAddress?: string;
  mobileNumber?: string;
  xUsername?: string;
  nonce?: string;
  token?: number;
  lastSpinAt?: Date;
  spinNotifiedAt?: Date;
  // Quiz limits
  quizAttemptsCount?: number;
  quizAttemptsDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  telegramId: number;
  telegramFirstName?: string;
  telegramLastName?: string;
  telegramUsername?: string;
  walletConnected: boolean;
  telegramPhotoUrl?: string;

  
  // New Added
  referredUsers: mongoose.Types.ObjectId[];
  referredBy: mongoose.Types.ObjectId | null;
  referralUsed: boolean;
  referralCount: number;
  telegramRewardClaimed: boolean;

  // Normalized social tasks tracking (preferred going forward)
  socialTasks?: Array<{
    platform: string; // e.g., 'twitter' | 'instagram' | 'linkedin' | 'medium' | 'discord'
    startedAt?: Date;
    rewarded?: boolean;
    rewardedAt?: Date;
  }>;

  // // Twitter task completion tracking (legacy kept)
  // twitterTaskStartedAt?: Date;
  // twitterFollowRewarded?: boolean;

  // Optional tasks are tracked via socialTasks

  // Section bundles
  compulsoryBundleAwarded?: boolean; // Telegram + Twitter
  compulsoryBundleAwardedAt?: Date;
  optionalBundleAwarded?: boolean; // any 2 of Instagram/Medium/LinkedIn/Discord
  optionalBundleAwardedAt?: Date;
  
  // Book reading reward tracking
  lastBookReadingRewardAt?: Date;
  readingSessionNonce?: string;
  // Premium plan flag
  isPremiumUser?: boolean;
  // Unlocked premium books by ID
  premiumBooks?: string[];
  lastWeekToken?: number;
  weeklyTokensEarned?: number;
  lastWeeklyReset?: Date;

  // Referral processing idempotency
  referralBoundAt?: Date;
  referralRewardedAt?: Date;
  referralRewardTxId?: string;
  botReferralPending?: boolean; // Flag for bot-initiated referrals
  
  // Referral level rewards tracking
  referralLevelRewards?: Array<{
    level: number; // 1, 2, or 3
    totalEarned: number; // Total tokens earned from this level
    referralCount: number; // Number of referrals at this level
    lastRewardAt?: Date; // Last time received reward from this level
  }>;

  // Terms and conditions agreement
  agreedToTerms?: boolean;
  agreedAt?: Date;
}
const UserSchema = new Schema<IUser>(
  { 
    fullName: { type: String,sparse:true },
    email: { type: String, unique: true, sparse: true },
    mobileNumber:{type: String, unique: true,sparse: true},
    xUsername: {type: String, unique: true,sparse: true},
    passwordHash: { type: String },
    walletAddress: { type: String, unique: true, sparse: true },
    nonce: { type: String },
    token: { type: Number, default: 0, index: true },
    lastSpinAt: { type: Date, default: null },
    spinNotifiedAt: { type: Date, default: undefined },
    // Quiz limits
    quizAttemptsCount: { type: Number, default: 0 },
    quizAttemptsDate: { type: Date, default: undefined },
    telegramId: { type: Number, required: true, unique: true },
    telegramFirstName: { type: String },
    telegramLastName: { type: String },
    telegramUsername: { type: String },
    telegramPhotoUrl: { type: String },
    walletConnected: { type: Boolean, default: false },

    referredUsers: [
      { type: Schema.Types.ObjectId, ref: "newuser", default: [] },
    ],
    referredBy: { type: Schema.Types.ObjectId, ref: "newuser", default: null },
    referralUsed: { type: Boolean, default: false },
    referralCount: { type: Number, default: 0 },
    telegramRewardClaimed: { type: Boolean, default: false },

    // Normalized social tasks tracking (preferred going forward)
    socialTasks: {
      type: [
        new Schema(
          {
            platform: { type: String, required: true },
            startedAt: { type: Date, default: undefined },
            rewarded: { type: Boolean, default: false },
            rewardedAt: { type: Date, default: undefined },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // // Twitter task completion tracking (legacy kept)
    // twitterTaskStartedAt: { type: Date, default: undefined },
    // twitterFollowRewarded: { type: Boolean, default: false },
    // Section bundles
    compulsoryBundleAwarded: { type: Boolean, default: false, index: true },
    compulsoryBundleAwardedAt: { type: Date, default: undefined },
    optionalBundleAwarded: { type: Boolean, default: false, index: true },
    optionalBundleAwardedAt: { type: Date, default: undefined },
    // Book reading reward tracking
    lastBookReadingRewardAt: { type: Date, default: undefined, index: true },
    readingSessionNonce: { type: String, default: undefined },
    // Premium plan flag
    isPremiumUser: { type: Boolean, default: false, index: true },
    // Unlocked premium books
    premiumBooks: { type: [String], default: [], index: true },

    lastWeekToken: { type: Number, default: 0 }, // Token count at the start of current week
    weeklyTokensEarned: { type: Number, default: 0 }, // Tokens earned this week
    lastWeeklyReset: { type: Date, default: null }, // Track when weekly reset happened

    // Referral processing idempotency and audit
    referralBoundAt: { type: Date, default: undefined, index: true },
    referralRewardedAt: { type: Date, default: undefined, index: true },
    referralRewardTxId: { type: String, default: undefined, index: true },
    botReferralPending: { type: Boolean, default: false, index: true },

    // Terms and conditions agreement
    agreedToTerms: { type: Boolean, default: false },
    agreedAt: { type: Date, default: null },

    // Referral level rewards tracking
    referralLevelRewards: {
      type: [
        new Schema(
          {
            level: { type: Number, required: true, min: 1, max: 3 },
            totalEarned: { type: Number, default: 0 },
            referralCount: { type: Number, default: 0 },
            lastRewardAt: { type: Date, default: undefined },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);
export const User = mongoose.model<IUser>("newuser", UserSchema);


