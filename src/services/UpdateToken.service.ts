import { Response } from "express";
import { z } from "zod";
import ResponseHandler from "../utils/apiResponse";
import { LoginToken } from "../types/types";
import { updateTokenValidation } from "../utils/validation";
import { User } from "../models/User.models";
import { console } from "inspector";

class UpdateTokenService {
  /**
   * Helper function to update tokens and recalculate weekly tokens
   * This ensures weeklyTokensEarned is always in sync
   */
  private async updateUserTokens(
    userId: string,
    tokensToAdd: number,
    additionalUpdates: any = {}
  ) {
    // Use aggregation pipeline to atomically update token and weeklyTokensEarned
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      [
        {
          $set: {
            _currentToken: { $ifNull: ["$token", 0] },
            _lastWeekToken: { $ifNull: ["$lastWeekToken", 0] },
          },
        },
        {
          $set: {
            token: { $add: ["$_currentToken", tokensToAdd] },
            weeklyTokensEarned: {
              $subtract: [
                { $add: ["$_currentToken", tokensToAdd] },
                "$_lastWeekToken",
              ],
            },
            ...additionalUpdates,
          },
        },
        {
          $unset: ["_currentToken", "_lastWeekToken"],
        },
      ],
      { new: true }
    );

    return updatedUser;
  }
  async quiz(
    tokenData: LoginToken,
    updateTokenData: z.infer<typeof updateTokenValidation>,
    res: any
  ) {
    try {
      const userID = tokenData._id;

      // Clamp quiz reward to [0,100]
      const clampedToken = Math.min(Math.max(updateTokenData.token, 0), 100);

      // Enforce 3 quizzes per calendar day (server local time) atomically
      // This limits quiz reward-granting requests to max 3 per user per day
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Use an aggregation pipeline update to handle reset + increment + token award in one atomic operation
      const updatedUser = await User.findOneAndUpdate(
        { _id: userID },
        [
          // Normalize missing fields
          {
            $set: {
              _qaDate: { $ifNull: ["$quizAttemptsDate", new Date(0)] },
              _qaCount: { $ifNull: ["$quizAttemptsCount", 0] },
              _token: { $ifNull: ["$token", 0] },
              _lastWeekToken: {$ifNull: ["$lastWeekToken",0]},
            },
          },
          // Determine if it's a new day
          {
            $set: { _isNewDay: { $lt: ["$_qaDate", startOfToday] } },
          },
          // Reset counter/date if new day
          {
            $set: {
              _qaCount: { $cond: ["$_isNewDay", 0, "$_qaCount"] },
              _qaDate: { $cond: ["$_isNewDay", now, "$_qaDate"] },
            },
          },
          // Check if user can still attempt (< 3)
          {
            $set: { _canAttempt: { $lt: ["$_qaCount", 3] } },
          },
          // Calculate new token value if can attempt
          {
            $set: {
              _newToken: {
                $cond: [
                  "$_canAttempt",
                  { $add: ["$_token", clampedToken] },
                  "$_token",
                ],
              },
            },
          },
          // If can attempt: increment and award tokens; else leave as-is
          {
            $set: {
              quizAttemptsCount: {
                $cond: ["$_canAttempt", { $add: ["$_qaCount", 1] }, "$_qaCount"],
              },
              quizAttemptsDate: { $cond: ["$_canAttempt", now, "$_qaDate"] },
              token: "$_newToken",
              weeklyTokensEarned: {
                $subtract: ["$_newToken", "$_lastWeekToken"],
              },
            },
          },
          { $unset: ["_qaDate", "_qaCount", "_isNewDay", "_canAttempt", "_token","_lastWeekToken","_newToken"] },
        ],
        { new: true }
      );

      if (!updatedUser) {
        return ResponseHandler.notFound(res, "User not found");
      }

      // If the stored count didn't change and is already >= 3 for today, block
      const attempts = updatedUser.quizAttemptsCount || 0;
      const sameDay = updatedUser.quizAttemptsDate
        ? updatedUser.quizAttemptsDate >= startOfToday
        : false;
      if (sameDay && attempts > 3) {
        // Should not happen with pipeline, but guard anyway
        return ResponseHandler.badRequest(
          res,
          "🚫 You have reached your 3 quiz attempts for today. Try again tomorrow."
        );
      }
      if (sameDay && attempts === 3 && updateTokenData.token === 0) {
        // Edge case if called with 0 tokens; treat as capped
        return ResponseHandler.badRequest(
          res,
          "🚫 You have reached your 3 quiz attempts for today. Try again tomorrow."
        );
      }

      // If attempts is still >= 3 after update, it means the user was capped
      if (sameDay && attempts >= 3 && (updatedUser.token || 0) % 1 === 0) {
        // Return explicit cap message
        return ResponseHandler.badRequest(
          res,
          "🚫 You have reached your 3 quiz attempts for today. Try again tomorrow."
        );
      }

      return ResponseHandler.success(
        res,
        "Token updated successfully",
        { token: updatedUser.token, quizAttemptsCount: updatedUser.quizAttemptsCount },
        200
      );
    } catch (error: any) {
      console.error("❌ Update Token Error:", error);
      return ResponseHandler.internalError(
        res,
        "Failed to update token",
        error
      );
    }
  }

  async spinWheel(userId: string, tokenEarned: number, res: Response) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return ResponseHandler.notFound(res, "User not found");
      }

      // Clamp spin reward to [100,500]
      const clampedToken = Math.min(Math.max(tokenEarned, 100), 500);

      const now = new Date();
      const lastSpin = user.lastSpinAt ? new Date(user.lastSpinAt) : null;

      // Check if 24 hours passed (1 spin per day)
      // This limits spin reward-granting requests to max 1 per user per day
      if (
        lastSpin &&
        now.getTime() - lastSpin.getTime() < 24 * 60 * 60 * 1000
      ) {
        const hoursLeft =
          24 -
          Math.floor((now.getTime() - lastSpin.getTime()) / (60 * 60 * 1000));
        return ResponseHandler.badRequest(
          res,
          `You can spin the wheel again in ${hoursLeft} hour(s)`
        );
      }
      // Update tokens with weekly tracking
      const updatedUser = await this.updateUserTokens(userId, clampedToken, {
        lastSpinAt: now,
      });
      if (!updatedUser) {
        return ResponseHandler.notFound(res, "User not found during update");
      }

      await user.save();

      return ResponseHandler.success(res, "Spin successful", {
        tokenEarned: clampedToken,
        totalTokens: updatedUser.token,
        weeklyTokensEarned: updatedUser.weeklyTokensEarned,
        lastSpinAt: updatedUser.lastSpinAt,
      });
    } catch (error: any) {
      console.error("❌ Spin Wheel Error:", error);
      return ResponseHandler.internalError(res, "Spin failed", error);
    }
  }

  async bookReading(tokenData: LoginToken, res: any, readingToken?: string, bookId?: string) {
    try {
      const userID = tokenData._id;

      // Fixed book reading reward amount - calculated on backend
      const BOOK_READING_REWARD = 20;

      // Require valid reading session token
      if (!readingToken || !bookId) {
        return ResponseHandler.badRequest(res, "Missing reading session token or bookId");
      }

      // Verify token: signed with JWT_SECRET, contains userId, bookId, nonce, exp<=10m
      let decoded: any;
      try {
        decoded = require("jsonwebtoken").verify(readingToken, process.env.JWT_SECRET as string);
      } catch (e) {
        return ResponseHandler.badRequest(res, "Invalid or expired reading session token");
      }
      const userIdStr = String(userID);
      const tokenUserId = String(decoded?.userId || "");
      const tokenBookId = String(decoded?.bookId || "");
      const reqBookId = String(bookId || "");
      if (!decoded || tokenUserId !== userIdStr || tokenBookId !== reqBookId || !decoded.nonce) {
        return ResponseHandler.badRequest(res, "Reading session token mismatch");
      }

      // Rate limiting: max 1 reward per 2 minutes (120 seconds)
      const now = new Date();
      const minIntervalMs = 2 * 60 * 1000; // 2 minutes in milliseconds

      // Read current user state from DB (JWT may be stale and not include this field)
      const existingUser = await User.findById(userID).select("_id token lastBookReadingRewardAt readingSessionNonce");
      if (!existingUser) {
        return ResponseHandler.notFound(res, "User not found");
      }

      // Enforce one-time nonce: if a nonce exists it must match; if missing, accept and initialize on success
      if (existingUser.readingSessionNonce && existingUser.readingSessionNonce !== decoded.nonce) {
        return ResponseHandler.badRequest(res, "Reading session nonce invalid");
      }

      const lastBookReward = existingUser.lastBookReadingRewardAt
        ? new Date(existingUser.lastBookReadingRewardAt)
        : null;

      // If within cooldown, block immediately with remaining seconds
      if (lastBookReward) {
        const elapsed = now.getTime() - lastBookReward.getTime();
        if (elapsed < minIntervalMs) {
          const remainingSeconds = Math.ceil((minIntervalMs - elapsed) / 1000);
          return ResponseHandler.badRequest(
            res,
            `Please wait ${remainingSeconds} seconds before claiming another reading reward`
          );
        }
      }

      // Atomic update with additional guard to avoid race conditions
      // Only award if no reward in the last 2 minutes (or never rewarded)
      const cutoff = new Date(now.getTime() - minIntervalMs);
      const newNonce = Math.random().toString(36).slice(2);
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: userID,
          $or: [
            { lastBookReadingRewardAt: { $exists: false } },
            { lastBookReadingRewardAt: { $lte: cutoff } },
          ],
        },
        [
          {
            $set: {
              _currentToken: { $ifNull: ["$token", 0] },
              _lastWeekToken: { $ifNull: ["$lastWeekToken", 0] },
            },
          },
          {
            $set: {
              token: { $add: ["$_currentToken", BOOK_READING_REWARD] },
              weeklyTokensEarned: {
                $subtract: [
                  { $add: ["$_currentToken", BOOK_READING_REWARD] },
                  "$_lastWeekToken",
                ],
              },
              lastBookReadingRewardAt: now,
              readingSessionNonce: newNonce,
            },
          },
          {
            $unset: ["_currentToken", "_lastWeekToken"],
          },
        ],
        { new: true }
      );

      if (!updatedUser) {
        // Another concurrent request may have claimed recently; compute remaining based on latest DB value
        const freshUser = await User.findById(userID).select("lastBookReadingRewardAt");
        const last = freshUser?.lastBookReadingRewardAt
          ? new Date(freshUser.lastBookReadingRewardAt)
          : null;
        if (last) {
          const elapsed = now.getTime() - last.getTime();
          const remainingSeconds = Math.max(0, Math.ceil((minIntervalMs - elapsed) / 1000));
          return ResponseHandler.badRequest(
            res,
            `Please wait ${remainingSeconds} seconds before claiming another reading reward`
          );
        }
        return ResponseHandler.badRequest(
          res,
          "Please wait before claiming another reading reward"
        );
      }

      // Issue a new short-lived reading token tied to the rotated nonce
      let newReadingToken: string | undefined = undefined;
      try {
        const jwtLib = require("jsonwebtoken");
        newReadingToken = jwtLib.sign(
          { userId: String(userID), bookId: String(bookId), nonce: newNonce },
          process.env.JWT_SECRET as string,
          { expiresIn: "10m" }
        );
      } catch { }

      return ResponseHandler.success(
        res,
        "Book reading reward granted",
        {
          tokenEarned: BOOK_READING_REWARD,
          totalTokens: updatedUser.token,
          weeklyTokensEarned: updatedUser.weeklyTokensEarned,
          lastBookReadingRewardAt: updatedUser.lastBookReadingRewardAt,
          nextNonce: newNonce,
          readingToken: newReadingToken
        },
        200
      );
    } catch (error: any) {
      console.error("❌ Book Reading Reward Error:", error);
      return ResponseHandler.internalError(
        res,
        "Failed to process book reading reward",
        error
      );
    }
  }
}
export default new UpdateTokenService();
