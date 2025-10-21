// src/services/IntegrationService.ts
import axios from "axios";
import { Response } from "express";
import ResponseHandler from "../utils/apiResponse";
import { User } from "../models/User.models";

const BOT_TOKEN = "8445547020:AAE-4x_ZRGd0srrWbaGdWwD35c2F4epiUzI";
const CHANNEL_USERNAME = "@invincible_read";

async function isUserChannelMember(telegramUserId: number) {
  if (!BOT_TOKEN || !CHANNEL_USERNAME) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_USERNAME");
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`;
  const { data } = await axios.get(url, {
    params: { chat_id: CHANNEL_USERNAME, user_id: telegramUserId },
  });

  if (!data?.ok) {
    throw new Error(
      data?.description ||
        "Telegram API error (is the bot an admin of the channel?)"
    );
  }
  const status = data.result?.status as string;
  return ["member", "administrator", "creator"].includes(status);
}

class IntegrationService {
  private readonly TWITTER_VERIFY_WAIT_MINUTES = 15;
  private readonly SOCIAL_VERIFY_WAIT_MINUTES = 15; // same wait as Twitter

  
  private async maybeAwardCompulsoryBundle(userDoc: any) {
    if (userDoc.compulsoryBundleAwarded) return { awarded: false, alreadyClaimed: true };

    // Prefer normalized socialTasks array if present
    const twitterCompletedFromArray = Array.isArray(userDoc.socialTasks)
      ? !!userDoc.socialTasks.find((t: any) => t.platform === "twitter" && t.rewarded)
      : false;
    const twitterCompleted = twitterCompletedFromArray ;

    const bothDone = !!(userDoc.telegramRewardClaimed && twitterCompleted);
    if (!bothDone) return { awarded: false };
    const updated = await User.findOneAndUpdate(
      { _id: userDoc._id, compulsoryBundleAwarded: { $ne: true } },
      {
        $inc: { token: 2000, weeklyTokensEarned:2000 },
        $set: { compulsoryBundleAwarded: true, compulsoryBundleAwardedAt: new Date() },
      },
      { new: true }
    );
    return updated ? { awarded: true, totalTokens: updated.token } : { awarded: false, alreadyClaimed: true };
  }

  private async maybeAwardOptionalBundle(userDoc: any) {
    if (userDoc.optionalBundleAwarded) return { awarded: false, alreadyClaimed: true };

    // Prefer normalized socialTasks array if present
    let optionalCompletedCount = 0;
    if (Array.isArray(userDoc.socialTasks) && userDoc.socialTasks.length) {
      const optionalPlatforms = new Set(["instagram", "medium", "linkedin", "discord"]);
      optionalCompletedCount = userDoc.socialTasks.filter(
        (t: any) => optionalPlatforms.has(t.platform) && t.rewarded,
      ).length;
    } else {
      optionalCompletedCount = [
        userDoc.instagramFollowRewarded,
        userDoc.mediumFollowRewarded,
        userDoc.linkedinFollowRewarded,
        userDoc.discordFollowRewarded,
      ].filter(Boolean).length;
    }
    if (optionalCompletedCount < 2) return { awarded: false };
    const updated = await User.findOneAndUpdate(
      { _id: userDoc._id, optionalBundleAwarded: { $ne: true } },
      {
        $inc: { token: 2000, weeklyTokensEarned:2000 },
        $set: { optionalBundleAwarded: true, optionalBundleAwardedAt: new Date() },
      },
      { new: true }
    );
    return updated ? { awarded: true, totalTokens: updated.token } : { awarded: false, alreadyClaimed: true };
  }

  /**
   * Idempotent reward: +500 tokens only once when user follows the channel.
   * Requires req.user to be set by JWT middleware.
   */
  async rewardTelegramFollow(req: any, res: Response) {
    try {
      const user = req.user; // from JWT middleware
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      if (!user.telegramId) {
        return ResponseHandler.badRequest(
          res,
          "User has no telegramId linked. Ask user to login via Telegram first."
        );
      }

      // Already claimed?
      if (user.telegramRewardClaimed) {
        const compulsory = await this.maybeAwardCompulsoryBundle(user);
        return ResponseHandler.success(res, "Telegram follow already recorded", {
          alreadyClaimed: true,
          bundleAwarded: compulsory.awarded || false,
          rewardAmount: compulsory.awarded ? 2000 : 0,
          totalTokens: compulsory.totalTokens,
        });
      }

      // Check membership
      const member = await isUserChannelMember(user.telegramId);
      if (!member) {
        return ResponseHandler.badRequest(
          res,
          "User is not following the channel"
        );
      }

      // Atomic one-time update
      const updated = await User.findOneAndUpdate(
        { _id: user._id, telegramRewardClaimed: { $ne: true } },
        { $set: { telegramRewardClaimed: true } },
        { new: true }
      );

      if (!updated) {
        const compulsory = await this.maybeAwardCompulsoryBundle(user);
        return ResponseHandler.success(res, "Telegram follow already recorded", {
          alreadyClaimed: true,
          bundleAwarded: compulsory.awarded || false,
          rewardAmount: compulsory.awarded ? 2000 : 0,
          totalTokens: compulsory.totalTokens,
        });
      }
      const compulsory = await this.maybeAwardCompulsoryBundle(updated);
      return ResponseHandler.success(res, "Telegram follow recorded", {
        rewarded: !!compulsory.awarded,
        bundleAwarded: compulsory.awarded || false,
        rewardAmount: compulsory.awarded ? 2000 : 0,
        totalTokens: compulsory.totalTokens || updated.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(
        res,
        "Failed to process Telegram follow reward",
        error?.message || error
      );
    }
  }

  // Optional: pure membership check for debugging
  async checkMembership(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user?.telegramId) {
        return ResponseHandler.badRequest(res, "No telegramId on user");
      }
      const member = await isUserChannelMember(user.telegramId);
      return ResponseHandler.success(res, "Membership checked", { member });
    } catch (error: any) {
      return ResponseHandler.internalError(
        res,
        "Failed to check membership",
        error?.message || error
      );
    }
  }

  /**
   * Get all available social media tasks
   */
  async getAvailableTasks(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const findTask = (platform: string) =>
        Array.isArray(user.socialTasks)
          ? user.socialTasks.find((t: any) => t.platform === platform)
          : undefined;

      const tasks = [
        {
          id: "telegram_follow",
          platform: "telegram",
          title: "Follow Telegram Channel",
          description: "Follow our official Telegram channel",
          reward: 1000,
          completed: user.telegramRewardClaimed || false,
          completedAt: user.telegramRewardClaimed ? user.updatedAt : null,
          actionUrl: "https://t.me/invincible_read",
          icon: "📢",
        },
        {
          id: "twitter_follow",
          platform: "twitter",
          title: "Follow Twitter Account",
          description: `Follow @${process.env.TWITTER_TARGET_USERNAME || "our Twitter account"}`,
          completed: !!findTask("twitter")?.startedAt,
          completedAt: findTask("twitter")?.startedAt || null,
          // Frontend should redirect to this Mini App task URL when user clicks Start Task
          actionUrl: process.env.MINIAPP_TWITTER_TASK_URL || null,
          icon: "🐦",
        },
        {
          id: "instagram_follow",
          platform: "instagram",
          title: "Follow Instagram Account",
          description: `Follow ${process.env.INSTAGRAM_TARGET_HANDLE || "our Instagram"}`,
          completed: !!findTask("instagram")?.startedAt,
          completedAt: findTask("instagram")?.startedAt || null,
          actionUrl: process.env.MINIAPP_INSTAGRAM_TASK_URL || null,
          icon: "📸",
        },
        {
          id: "linkedin_follow",
          platform: "linkedin",
          title: "Follow LinkedIn Page",
          description: `Follow ${process.env.LINKEDIN_TARGET_HANDLE || "our LinkedIn"}`,
          completed: !!findTask("linkedin")?.startedAt,
          completedAt: findTask("linkedin")?.startedAt || null,
          actionUrl: process.env.MINIAPP_LINKEDIN_TASK_URL || null,
          icon: "🔗",
        },
      ];

      return ResponseHandler.success(res, "Available tasks retrieved", { tasks });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get available tasks", error.message);
    }
  }

  /**
   * Get user's social media connections status
   */
  async getSocialConnections(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const findTask = (platform: string) =>
        Array.isArray(user.socialTasks)
          ? user.socialTasks.find((t: any) => t.platform === platform)
          : undefined;

      const connections = {
        telegram: {
          connected: !!user.telegramId,
          username: user.telegramUsername,
          firstName: user.telegramFirstName,
          connectedAt: user.createdAt, // Telegram users are created on first login
          rewardClaimed: user.telegramRewardClaimed || false,
          rewardClaimedAt: user.telegramRewardClaimed ? user.updatedAt : null,
        },
        twitter: {
          connected: !!findTask("twitter")?.startedAt,
          taskStartedAt: findTask("twitter")?.startedAt,
          waitMinutes: this.TWITTER_VERIFY_WAIT_MINUTES,
        },
        instagram: {
          connected: !!findTask("instagram")?.startedAt,
          taskStartedAt: findTask("instagram")?.startedAt,
          waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
        },
        linkedin: {
          connected: !!findTask("linkedin")?.startedAt,
          taskStartedAt: findTask("linkedin")?.startedAt,
          waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
        },
      };

      return ResponseHandler.success(res, "Social connections retrieved", { connections });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get social connections", error.message);
    }
  }

  /**
   * Get summary of completed social media tasks
   */
  async getCompletedTasksSummary(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const completedTasks = [] as any[];
      let totalRewardsEarned = 0;

      if (user.telegramRewardClaimed) {
        completedTasks.push({
          platform: "telegram",
          task: "Follow Telegram Channel",
          reward: 1000,
          completedAt: user.updatedAt,
        });
        totalRewardsEarned += 1000;
      }

      // Do not list individual social completions; only list the bundle below

      if (user.compulsoryBundleAwarded) {
        completedTasks.push({
          platform: "bundle",
          task: "Compulsory (Telegram + Twitter)",
          reward: 2000,
          completedAt: user.compulsoryBundleAwardedAt,
        });
        totalRewardsEarned += 2000;
      }

      if (user.optionalBundleAwarded) {
        completedTasks.push({
          platform: "bundle",
          task: "Optional (any 2 of IG/Medium/LinkedIn/Discord)",
          reward: 2000,
          completedAt: user.optionalBundleAwardedAt,
        });
        totalRewardsEarned += 2000;
      }

      const summary = {
        totalTasksCompleted: completedTasks.length,
        totalRewardsEarned,
        completedTasks,
        availableTasks: 2 - completedTasks.length, // two bundles available
      };

      return ResponseHandler.success(res, "Completed tasks summary retrieved", summary);
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get completed tasks summary", error.message);
    }
  }

  /**
   * Verify and complete social media tasks
   */
  async verifySocialTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const { taskId } = req.body;
      if (!taskId) {
        return ResponseHandler.badRequest(res, "Task ID is required");
      }

      switch (taskId) {
        case "telegram_follow":
          return await this.rewardTelegramFollow(req, res);
        case "twitter_follow":
          return this.verifyTwitterTask(req, res);
        case "instagram_follow":
          return this.verifyInstagramTask(req, res);
        case "linkedin_follow":
          return this.verifyLinkedInTask(req, res);
        default:
          return ResponseHandler.badRequest(res, "Invalid task ID");
      }
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify social task", error.message);
    }
  }

  /**
   * Get user's rewards history from social media tasks
   */
  async getRewardsHistory(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const rewardsHistory = [] as any[];

      if (user.telegramRewardClaimed) {
        rewardsHistory.push({
          id: "telegram_follow_reward",
          platform: "telegram",
          task: "Follow Telegram Channel",
          reward: 0,
          earnedAt: user.updatedAt,
          type: "social_task",
        });
      }

      // Bundles
      if (user.compulsoryBundleAwarded) {
        rewardsHistory.push({
          id: "bundle_compulsory",
          platform: "bundle",
          task: "Compulsory (Telegram + Twitter)",
          reward: 2000,
          earnedAt: user.compulsoryBundleAwardedAt,
          type: "bundle_reward",
        });
      }
      if (user.optionalBundleAwarded) {
        rewardsHistory.push({
          id: "bundle_optional",
          platform: "bundle",
          task: "Optional (any 2 of IG/Medium/LinkedIn/Discord)",
          reward: 2000,
          earnedAt: user.optionalBundleAwardedAt,
          type: "bundle_reward",
        });
      }

      // Sort by date (newest first)
      rewardsHistory.sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime());

      return ResponseHandler.success(res, "Rewards history retrieved", {
        rewards: rewardsHistory,
        totalRewards: rewardsHistory.reduce((sum, reward) => sum + reward.reward, 0),
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get rewards history", error.message);
    }
  }

  // /**
  //  * Disconnect all social media accounts
  //  */
  // async disconnectAllSocialAccounts(req: any, res: Response) {
  //   try {
  //     const user = req.user;
  //     if (!user) {
  //       return ResponseHandler.unauthorized(res, "Unauthorized");
  //     }

  //     const disconnectedAccounts = [] as string[];

  //     // Disconnect Telegram (reset reward status)
  //     if (user.telegramId) {
  //       user.telegramRewardClaimed = false;
  //       disconnectedAccounts.push("telegram");
  //     }

  //     // Disconnect Twitter
  //     if (findTask("twitter")?.startedAt) {
  //       findTask("twitter").startedAt = undefined;
  //       disconnectedAccounts.push("twitter");
  //     }

  //     // Disconnect optional tasks via socialTasks
  //     const before = Array.isArray(user.socialTasks) ? user.socialTasks.slice() : [];
  //     const remaining = before.filter((t: any) => !["instagram", "linkedin", "medium", "discord"].includes(t.platform));
  //     const removed = before.filter((t: any) => ["instagram", "linkedin", "medium", "discord"].includes(t.platform));
  //     if (removed.length > 0) {
  //       user.socialTasks = remaining;
  //       for (const r of removed) disconnectedAccounts.push(r.platform);
  //     }

  //     await user.save();

  //     return ResponseHandler.success(res, "All social accounts disconnected", {
  //       disconnectedAccounts,
  //       count: disconnectedAccounts.length,
  //     });
  //   } catch (error: any) {
  //     return ResponseHandler.internalError(res, "Failed to disconnect social accounts", error.message);
  //   }
  // }

  /**
   * Get social media statistics and metrics
   */
  async getSocialStats(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const findTask = (platform: string) =>
        Array.isArray(user.socialTasks)
          ? user.socialTasks.find((t: any) => t.platform === platform)
          : undefined;

      const stats = {
        totalConnectedAccounts: 0,
        totalTasksCompleted: 0,
        totalRewardsEarned: 0,
        platforms: {
          telegram: {
            connected: !!user.telegramId,
            rewardClaimed: user.telegramRewardClaimed || false,
            rewardAmount: 0,
          },
          twitter: {
            connected: !!findTask("twitter")?.startedAt,
          },
          instagram: {
            connected: !!findTask("instagram")?.startedAt,
          },
          linkedin: {
            connected: !!findTask("linkedin")?.startedAt,
          },
          medium: {
            connected: !!findTask("medium")?.startedAt,
          },
          discord: {
            connected: !!findTask("discord")?.startedAt,
          },
          bundle: {
            enabled: true,
            compulsory: user.compulsoryBundleAwarded || false,
            optional: user.optionalBundleAwarded || false,
            rewardAmount: (user.compulsoryBundleAwarded ? 2000 : 0) + (user.optionalBundleAwarded ? 2000 : 0),
          },
        },
      } as any;

      // Calculate totals
      if (stats.platforms.telegram.connected) stats.totalConnectedAccounts++;
      if (stats.platforms.twitter.connected) stats.totalConnectedAccounts++;
      if (stats.platforms.instagram.connected) stats.totalConnectedAccounts++;
      if (stats.platforms.linkedin.connected) stats.totalConnectedAccounts++;
      if (stats.platforms.medium.connected) stats.totalConnectedAccounts++;
      if (stats.platforms.discord.connected) stats.totalConnectedAccounts++;
      
      if (stats.platforms.bundle.compulsory) {
        stats.totalTasksCompleted++;
        stats.totalRewardsEarned += 2000;
      }
      if (stats.platforms.bundle.optional) {
        stats.totalTasksCompleted++;
        stats.totalRewardsEarned += 2000;
      }

      return ResponseHandler.success(res, "Social stats retrieved", stats);
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get social stats", error.message);
    }
  }

  /**
   * Start Twitter task: records start time and returns mini app URL
   */
  async startTwitterTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const now = new Date();
      
      // Only set twitterTaskStartedAt if it doesn't already exist (first time only)
      const updated = await User.findByIdAndUpdate(
        user._id,
        {},
        { new: true }
      );
      // Check if Instagram task already exists
      const existingTwitterTask = user.socialTasks?.find(task => task.platform === "twitter");
      
      if (existingTwitterTask && existingTwitterTask.startedAt) {
        // // Task already started, don't update startedAt
        // await User.updateOne(
        //   { _id: user._id, "socialTasks.platform": "twitter" },
        //   { $set: { "socialTasks.$.startedAt": existingTwitterTask.startedAt } }
        // );
      } else {
        // Ensure socialTasks entry exists for twitter with startedAt set
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "twitter" },
          { $set: { "socialTasks.$.startedAt": now } }
        );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "twitter" } },
        { $push: { socialTasks: { platform: "twitter", startedAt: now, rewarded: false } } }
      );
      }
      const actionUrl = process.env.MINIAPP_TWITTER_TASK_URL || null;
      const startedAt = existingTwitterTask?.startedAt || now;
      return ResponseHandler.success(res, "Twitter task started", {
        startedAt,
        actionUrl,
        twitterUrl: actionUrl,
        waitMinutes: this.TWITTER_VERIFY_WAIT_MINUTES,
      });
    }
    catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to start Twitter task", error?.message || error);
    }
  }

  /**
   * Verify Twitter task with a 15-minute wait. If eligible, award 2000 points once.
   */
  async verifyTwitterTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const twitterTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "twitter")
        : undefined;
      if (!twitterTask?.startedAt) {
        return ResponseHandler.badRequest(
          res,
          "Please start the Twitter task first by clicking 'Start Task'"
        );
      }

      // Enforce wait window
      const startedAt = new Date(twitterTask.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const requiredMs = this.TWITTER_VERIFY_WAIT_MINUTES * 60 * 1000;

      if (elapsedMs < requiredMs) {
        const remainingMs = requiredMs - elapsedMs;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return ResponseHandler.success(res, "Verification in process, please wait", {
          canVerify: false,
          message: `Verification is in process. Please wait for ${remainingMinutes} minute(s).`,
          secondsRemaining: Math.ceil(remainingMs / 1000),
          remainingMinutes,
        });
      }


      await User.updateOne(
        { _id: user._id, "socialTasks.platform": "twitter" },
        { $set: { "socialTasks.$.rewarded": true, "socialTasks.$.rewardedAt": new Date() } }
      );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "twitter" } },
        { $push: { socialTasks: { platform: "twitter", rewarded: true, rewardedAt: new Date() } } }
      );

      // Mark Twitter task as completed (both legacy and normalized)
      const updatedUser = await User.findOne(user._id);

      if (!updatedUser) {
        // Task already completed, just check bundle eligibility
        const compulsory = await this.maybeAwardCompulsoryBundle(user);
        return ResponseHandler.success(res, "Twitter task already completed", {
          rewarded: !!compulsory.awarded,
          bundleAwarded: compulsory.awarded || false,
          rewardAmount: compulsory.awarded ? 2000 : 0,
          totalTokens: compulsory.totalTokens || user.token,
        });
      }

      // Check bundle eligibility with updated user
      const compulsory = await this.maybeAwardCompulsoryBundle(updatedUser);
      return ResponseHandler.success(res, "Twitter task completed", {
        rewarded: !!compulsory.awarded,
        bundleAwarded: compulsory.awarded || false,
        rewardAmount: compulsory.awarded ? 2000 : 0,
        totalTokens: compulsory.totalTokens || updatedUser.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify Twitter task", error?.message || error);
    }
  }

  /**
   * Start Instagram task (mirrors Twitter)
   */
  async startInstagramTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const now = new Date();
      const updated = await User.findByIdAndUpdate(
        user._id,
        {},
        { new: true }
      );

      // Check if Instagram task already exists
      const existingInstagramTask = user.socialTasks?.find(task => task.platform === "instagram");
      
      if (existingInstagramTask && existingInstagramTask.startedAt) {
        // Task already started, don't update startedAt
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "instagram" },
          { $set: { "socialTasks.$.startedAt": existingInstagramTask.startedAt } }
        );
      } else {
        // First time starting Instagram task
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "instagram" },
          { $set: { "socialTasks.$.startedAt": now } }
        );
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": { $ne: "instagram" } },
          { $push: { socialTasks: { platform: "instagram", startedAt: now, rewarded: false } } }
        );
      }

      const actionUrl = process.env.MINIAPP_INSTAGRAM_TASK_URL || null;
      const startedAt = existingInstagramTask?.startedAt || now;

      return ResponseHandler.success(res, "Instagram task started", {
        startedAt,
        actionUrl,
        instagramUrl: actionUrl,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to start Instagram task", error?.message || error);
    }
  }

  /**
   * Verify Instagram task with a wait window and award points once
   */
  async verifyInstagramTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const igTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "instagram")
        : undefined;
      if (!igTask?.startedAt) {
        return ResponseHandler.badRequest(
          res,
          "Please start the Instagram task first by clicking 'Start Task'"
        );
      }

      const startedAt = new Date(igTask.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const requiredMs = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;

      if (elapsedMs < requiredMs) {
        const remainingMs = requiredMs - elapsedMs;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return ResponseHandler.success(res, "Verification in process, please wait", {
          canVerify: false,
          message: `Verification is in process. Please wait for ${remainingMinutes} minute(s).`,
          secondsRemaining: Math.ceil(remainingMs / 1000),
          remainingMinutes,
        });
      }

      // Mark Instagram task as completed (both legacy and normalized)
      const updatedUser = await User.findById(user._id);
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": "instagram" },
        { $set: { "socialTasks.$.rewarded": true, "socialTasks.$.rewardedAt": new Date() } }
      );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "instagram" } },
        { $push: { socialTasks: { platform: "instagram", rewarded: true, rewardedAt: new Date() } } }
      );

      const refreshedUser = await User.findById(user._id);
      if (!refreshedUser) {
        // Task already completed, just check bundle eligibility
        const optional = await this.maybeAwardOptionalBundle(user);
        return ResponseHandler.success(res, "Instagram task already completed", {
          rewarded: !!optional.awarded,
          bundleAwarded: optional.awarded || false,
          rewardAmount: optional.awarded ? 2000 : 0,
          totalTokens: optional.totalTokens || user.token,
        });
      }

      // Check bundle eligibility with updated user
      const optional = await this.maybeAwardOptionalBundle(refreshedUser);
      return ResponseHandler.success(res, "Instagram task completed", {
        rewarded: !!optional.awarded,
        bundleAwarded: optional.awarded || false,
        rewardAmount: optional.awarded ? 2000 : 0,
        totalTokens: optional.totalTokens || refreshedUser.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify Instagram task", error?.message || error);
    }
  }

  /**
   * Instagram status
   */
  async getInstagramStatus(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const igTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "instagram")
        : undefined;
      const startedAt = igTask?.startedAt ? new Date(igTask.startedAt) : undefined;
      const rewarded = !!igTask?.rewarded;

      let canVerify = false;
      let remainingMs = 0;
      let remainingMinutes: number | undefined = undefined;

      if (startedAt) {
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();
        const required = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
        if (elapsed >= required) {
          canVerify = true;
        } else {
          remainingMs = required - elapsed;
          remainingMinutes = Math.ceil(remainingMs / 60000);
        }
      }

      return ResponseHandler.success(res, "Instagram status", {
        taskStarted: !!startedAt,
        followRewarded: rewarded,
        canVerify,
        remainingMinutes,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get Instagram status", error?.message || error);
    }
  }

  /**
   * Start LinkedIn task (mirrors Twitter)
   */
  async startLinkedInTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const now = new Date();
      const updated = await User.findByIdAndUpdate(user._id, {}, { new: true });

      // Check if LinkedIn task already exists
      const existingLinkedInTask = user.socialTasks?.find(task => task.platform === "linkedin");
      
      if (existingLinkedInTask && existingLinkedInTask.startedAt) {
        // Task already started, don't update startedAt
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "linkedin" },
          { $set: { "socialTasks.$.startedAt": existingLinkedInTask.startedAt } }
        );
      } else {
        // First time starting LinkedIn task
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "linkedin" },
          { $set: { "socialTasks.$.startedAt": now } }
        );
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": { $ne: "linkedin" } },
          { $push: { socialTasks: { platform: "linkedin", startedAt: now, rewarded: false } } }
        );
      }

      const actionUrl = process.env.MINIAPP_LINKEDIN_TASK_URL || null;
      const startedAt = existingLinkedInTask?.startedAt || now;

      return ResponseHandler.success(res, "LinkedIn task started", {
        startedAt,
        actionUrl,
        linkedinUrl: actionUrl,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to start LinkedIn task", error?.message || error);
    }
  }

  /**
   * Verify LinkedIn task with a wait window and award points once
   */
  async verifyLinkedInTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const liTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "linkedin")
        : undefined;
      if (!liTask?.startedAt) {
        return ResponseHandler.badRequest(
          res,
          "Please start the LinkedIn task first by clicking 'Start Task'"
        );
      }

      const startedAt = new Date(liTask.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const requiredMs = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;

      if (elapsedMs < requiredMs) {
        const remainingMs = requiredMs - elapsedMs;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return ResponseHandler.success(res, "Verification in process, please wait", {
          canVerify: false,
          message: `Verification is in process. Please wait for ${remainingMinutes} minute(s).`,
          secondsRemaining: Math.ceil(remainingMs / 1000),
          remainingMinutes,
        });
      }

      // Mark LinkedIn task as completed (both legacy and normalized)
      const updatedUser = await User.findById(user._id);
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": "linkedin" },
        { $set: { "socialTasks.$.rewarded": true, "socialTasks.$.rewardedAt": new Date() } }
      );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "linkedin" } },
        { $push: { socialTasks: { platform: "linkedin", rewarded: true, rewardedAt: new Date() } } }
      );

      const refreshedUser = await User.findById(user._id);
      if (!refreshedUser) {
        // Task already completed, just check bundle eligibility
        const optional = await this.maybeAwardOptionalBundle(user);
        return ResponseHandler.success(res, "LinkedIn task already completed", {
          rewarded: !!optional.awarded,
          bundleAwarded: optional.awarded || false,
          rewardAmount: optional.awarded ? 2000 : 0,
          totalTokens: optional.totalTokens || user.token,
        });
      }

      // Check bundle eligibility with updated user
      const optional = await this.maybeAwardOptionalBundle(refreshedUser);
      return ResponseHandler.success(res, "LinkedIn task completed", {
        rewarded: !!optional.awarded,
        bundleAwarded: optional.awarded || false,
        rewardAmount: optional.awarded ? 2000 : 0,
        totalTokens: optional.totalTokens || refreshedUser.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify LinkedIn task", error?.message || error);
    }
  }

  /**
   * LinkedIn status
   */
  async getLinkedInStatus(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const linkedinTask = Array.isArray(user.socialTasks) ? user.socialTasks.find((t: any)=> t.platform === "linkedin") : undefined;

      const startedAt = linkedinTask?.startedAt ? new Date(linkedinTask.startedAt) : undefined;
      const rewarded = !!linkedinTask?.rewarded;

      let canVerify = false;
      let remainingMs = 0;
      let remainingMinutes: number | undefined = undefined;

      if (startedAt) {
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();
        const required = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
        if (elapsed >= required) {
          canVerify = true;
        } else {
          remainingMs = required - elapsed;
          remainingMinutes = Math.ceil(remainingMs / 60000);
        }
      }

      return ResponseHandler.success(res, "LinkedIn status", {
        taskStarted: !!startedAt,
        followRewarded: rewarded,
        canVerify,
        remainingMinutes,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get LinkedIn status", error?.message || error);
    }
  }

  /**
   * Get Twitter task status: started, rewarded, cooldown remaining
   */
  async getTwitterStatus(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }

      const twitterTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "twitter")
        : undefined;
        const startedAt = twitterTask?.startedAt ? new Date(twitterTask.startedAt) : undefined;
      const rewarded = !!twitterTask?.rewarded;

      let canVerify = false;
      let remainingMs = 0;
      let remainingMinutes: number | undefined = undefined;

      if (startedAt) {
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();
        const required = this.TWITTER_VERIFY_WAIT_MINUTES * 60 * 1000;
        if (elapsed >= required) {
          canVerify = true;
        } else {
          remainingMs = required - elapsed;
          remainingMinutes = Math.ceil(remainingMs / 60000);
        }
      }

      return ResponseHandler.success(res, "Twitter status", {
        taskStarted: !!startedAt,
        followRewarded: rewarded,
        canVerify,
        remainingMinutes,
        waitMinutes: this.TWITTER_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get Twitter status", error?.message || error);
    }
  }

  /**
   * Start Medium task
   */
  async startMediumTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const now = new Date();
      const updated = await User.findByIdAndUpdate(
        user._id,
        {},
        { new: true }
      );

      // Check if Medium task already exists
      const existingMediumTask = user.socialTasks?.find(task => task.platform === "medium");
      
      if (existingMediumTask && existingMediumTask.startedAt) {
        // Task already started, don't update startedAt
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "medium" },
          { $set: { "socialTasks.$.startedAt": existingMediumTask.startedAt } }
        );
      } else {
        // First time starting Medium task
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "medium" },
          { $set: { "socialTasks.$.startedAt": now } }
        );
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": { $ne: "medium" } },
          { $push: { socialTasks: { platform: "medium", startedAt: now, rewarded: false } } }
        );
      }

      const actionUrl = process.env.MINIAPP_MEDIUM_TASK_URL || null;
      const startedAt = existingMediumTask?.startedAt || now;

      return ResponseHandler.success(res, "Medium task started", {
        startedAt,
        actionUrl,
        mediumUrl: actionUrl,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to start Medium task", error?.message || error);
    }
  }

  /**
   * Verify Medium task
   */
  async verifyMediumTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const mTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "medium")
        : undefined;
      if (!mTask?.startedAt) {
        return ResponseHandler.badRequest(
          res,
          "Please start the Medium task first by clicking 'Start Task'"
        );
      }
      const startedAt = new Date(mTask.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const requiredMs = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
      if (elapsedMs < requiredMs) {
        const remainingMs = requiredMs - elapsedMs;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return ResponseHandler.success(res, "Verification in process, please wait", {
          canVerify: false,
          message: `Verification is in process. Please wait for ${remainingMinutes} minute(s).`,
          secondsRemaining: Math.ceil(remainingMs / 1000),
          remainingMinutes,
        });
      }
      // Mark Medium task as completed (both legacy and normalized)
      const updatedUser = await User.findById(user._id);
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": "medium" },
        { $set: { "socialTasks.$.rewarded": true, "socialTasks.$.rewardedAt": new Date() } }
      );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "medium" } },
        { $push: { socialTasks: { platform: "medium", rewarded: true, rewardedAt: new Date() } } }
      );

      const refreshedUser = await User.findById(user._id);
      if (!refreshedUser) {
        // Task already completed, just check bundle eligibility
        const optional = await this.maybeAwardOptionalBundle(user);
        return ResponseHandler.success(res, "Medium task already completed", {
          rewarded: !!optional.awarded,
          bundleAwarded: optional.awarded || false,
          rewardAmount: optional.awarded ? 2000 : 0,
          totalTokens: optional.totalTokens || user.token,
        });
      }

      // Check bundle eligibility with updated user
      const optional = await this.maybeAwardOptionalBundle(refreshedUser);
      return ResponseHandler.success(res, "Medium task completed", {
        rewarded: !!optional.awarded,
        bundleAwarded: optional.awarded || false,
        rewardAmount: optional.awarded ? 2000 : 0,
        totalTokens: optional.totalTokens || refreshedUser.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify Medium task", error?.message || error);
    }
  }

  /**
   * Medium status
   */
  async getMediumStatus(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const mTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "medium")
        : undefined;
      const startedAt = mTask?.startedAt ? new Date(mTask.startedAt) : undefined;
      const rewarded = !!mTask?.rewarded;
      let canVerify = false;
      let remainingMs = 0;
      let remainingMinutes: number | undefined = undefined;
      if (startedAt) {
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();
        const required = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
        if (elapsed >= required) canVerify = true;
        else {
          remainingMs = required - elapsed;
          remainingMinutes = Math.ceil(remainingMs / 60000);
        }
      }
      return ResponseHandler.success(res, "Medium status", {
        taskStarted: !!startedAt,
        followRewarded: rewarded,
        canVerify,
        remainingMinutes,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get Medium status", error?.message || error);
    }
  }

  /**
   * Start Discord task
   */
  async startDiscordTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const now = new Date();
      const updated = await User.findByIdAndUpdate(
        user._id,
        {},
        { new: true }
      );

      // Check if Discord task already exists
      const existingDiscordTask = user.socialTasks?.find(task => task.platform === "discord");
      
      if (existingDiscordTask && existingDiscordTask.startedAt) {
        // Task already started, don't update startedAt
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "discord" },
          { $set: { "socialTasks.$.startedAt": existingDiscordTask.startedAt } }
        );
      } else {
        // First time starting Discord task
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": "discord" },
          { $set: { "socialTasks.$.startedAt": now } }
        );
        await User.updateOne(
          { _id: user._id, "socialTasks.platform": { $ne: "discord" } },
          { $push: { socialTasks: { platform: "discord", startedAt: now, rewarded: false } } }
        );
      }

      const actionUrl = process.env.MINIAPP_DISCORD_TASK_URL || null;
      const startedAt = existingDiscordTask?.startedAt || now;

      return ResponseHandler.success(res, "Discord task started", {
        startedAt,
        actionUrl,
        discordUrl: actionUrl,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to start Discord task", error?.message || error);
    }
  }

  /**
   * Verify Discord task
   */
  async verifyDiscordTask(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const dTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "discord")
        : undefined;
      if (!dTask?.startedAt) {
        return ResponseHandler.badRequest(
          res,
          "Please start the Discord task first by clicking 'Start Task'"
        );
      }
      const startedAt = new Date(dTask.startedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const requiredMs = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
      if (elapsedMs < requiredMs) {
        const remainingMs = requiredMs - elapsedMs;
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return ResponseHandler.success(res, "Verification in process, please wait", {
          canVerify: false,
          message: `Verification is in process. Please wait for ${remainingMinutes} minute(s).`,
          secondsRemaining: Math.ceil(remainingMs / 1000),
          remainingMinutes,
        });
      }
      // Mark Discord task as completed (both legacy and normalized)
      const updatedUser = await User.findById(user._id);
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": "discord" },
        { $set: { "socialTasks.$.rewarded": true, "socialTasks.$.rewardedAt": new Date() } }
      );
      await User.updateOne(
        { _id: user._id, "socialTasks.platform": { $ne: "discord" } },
        { $push: { socialTasks: { platform: "discord", rewarded: true, rewardedAt: new Date() } } }
      );

      const refreshedUser = await User.findById(user._id);
      if (!refreshedUser) {
        // Task already completed, just check bundle eligibility
        const optional = await this.maybeAwardOptionalBundle(user);
        return ResponseHandler.success(res, "Discord task already completed", {
          rewarded: !!optional.awarded,
          bundleAwarded: optional.awarded || false,
          rewardAmount: optional.awarded ? 2000 : 0,
          totalTokens: optional.totalTokens || user.token,
        });
      }

      // Check bundle eligibility with updated user
      const optional = await this.maybeAwardOptionalBundle(refreshedUser);
      return ResponseHandler.success(res, "Discord task completed", {
        rewarded: !!optional.awarded,
        bundleAwarded: optional.awarded || false,
        rewardAmount: optional.awarded ? 2000 : 0,
        totalTokens: optional.totalTokens || refreshedUser.token,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to verify Discord task", error?.message || error);
    }
  }

  /**
   * Discord status
   */
  async getDiscordStatus(req: any, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseHandler.unauthorized(res, "Unauthorized");
      }
      const dTask = Array.isArray(user.socialTasks)
        ? user.socialTasks.find((t: any) => t.platform === "discord")
        : undefined;
      const startedAt = dTask?.startedAt ? new Date(dTask.startedAt) : undefined;
      const rewarded = !!dTask?.rewarded;
      let canVerify = false;
      let remainingMs = 0;
      let remainingMinutes: number | undefined = undefined;
      if (startedAt) {
        const now = new Date();
        const elapsed = now.getTime() - startedAt.getTime();
        const required = this.SOCIAL_VERIFY_WAIT_MINUTES * 60 * 1000;
        if (elapsed >= required) canVerify = true;
        else {
          remainingMs = required - elapsed;
          remainingMinutes = Math.ceil(remainingMs / 60000);
        }
      }
      return ResponseHandler.success(res, "Discord status", {
        taskStarted: !!startedAt,
        followRewarded: rewarded,
        canVerify,
        remainingMinutes,
        waitMinutes: this.SOCIAL_VERIFY_WAIT_MINUTES,
      });
    } catch (error: any) {
      return ResponseHandler.internalError(res, "Failed to get Discord status", error?.message || error);
    }
  }
}

export default new IntegrationService();
