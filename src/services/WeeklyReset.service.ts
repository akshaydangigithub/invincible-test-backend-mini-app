import { User } from "../models/User.models";

class WeeklyResetService {

  async resetWeeklyTokens() {
    try {
      const now = new Date();
      
      // Update all users: move current tokens to lastWeekToken, reset weeklyTokensEarned
      const result = await User.updateMany(
        {},
        [
          {
            $set: {
              lastWeekToken: "$token", // Current total becomes last week's total
              weeklyTokensEarned: 0,   // Reset weekly earnings
              lastWeeklyReset: now
            }
          }
        ]
      );

      console.log(`✅ Weekly reset completed. Updated ${result.modifiedCount} users.`);
      return result;
    } catch (error) {
      console.error("❌ Weekly reset failed:", error);
      throw error;
    }
  }

  /**
   * Check if weekly reset is needed and perform it
   * Call this on server startup or via cron job
   */
  async checkAndResetIfNeeded() {
    try {
      // Find the most recent reset date
      const lastReset = await User.findOne(
        { lastWeeklyReset: { $exists: true, $ne: null } },
        { lastWeeklyReset: 1 }
      )
        .sort({ lastWeeklyReset: -1 })
        .lean();

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // If no reset has happened or last reset was more than 7 days ago
      if (!lastReset || !lastReset.lastWeeklyReset || lastReset.lastWeeklyReset < oneWeekAgo) {
        console.log("🔄 Weekly reset needed, performing reset...");
        await this.resetWeeklyTokens();
        return true;
      }

      console.log("✓ Weekly reset not needed yet.");
      return false;
    } catch (error) {
      console.error("❌ Error checking weekly reset:", error);
      throw error;
    }
  }

  /**
   * Get the start of the current week (Monday 00:00 UTC)
   */
  getWeekStartDate(): Date {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const daysToMonday = (dayOfWeek + 6) % 7; // 0 = Monday
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return monday;
  }
  
    /**
   * Get time remaining until next weekly reset
   */
  getTimeUntilNextReset(): { days: number; hours: number; minutes: number } {
    const now = new Date();
    const nextMonday = this.getWeekStartDate();
    
    // If today is Monday and it's past midnight, add 7 days
    if (nextMonday <= now) {
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
    }

    const diff = nextMonday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes };
  }
}

export default new WeeklyResetService();