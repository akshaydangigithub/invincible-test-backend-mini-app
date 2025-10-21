import cron from "node-cron";
import WeeklyResetService from "../services/WeeklyReset.service";

/**
 * Start the weekly reset scheduler
 * Runs every Monday at 00:00 UTC
 */
export function startWeeklyResetScheduler() {
  // Get cron schedule from environment or use default
  const cronSchedule = process.env.WEEKLY_RESET_CRON || "0 0 * * 1";
  
  console.log(`📅 Scheduling weekly reset with cron: ${cronSchedule}`);

  // Schedule weekly reset
  cron.schedule(cronSchedule, async () => {
    console.log("🔄 Running scheduled weekly reset...");
    try {
      await WeeklyResetService.resetWeeklyTokens();
      console.log("✅ Scheduled weekly reset completed successfully");
    } catch (error) {
      console.error("❌ Scheduled weekly reset failed:", error);
    }
  });

  console.log("✅ Weekly reset scheduler initialized");
}

/**
 * Perform initial weekly reset check on server startup
 */
export async function initializeWeeklyReset() {
  try {
    console.log("🔍 Checking if weekly reset is needed on startup...");
    const resetPerformed = await WeeklyResetService.checkAndResetIfNeeded();
    
    if (resetPerformed) {
      console.log("✅ Weekly reset performed on startup");
    } else {
      console.log("✅ No weekly reset needed at this time");
    }
  } catch (error) {
    console.error("❌ Error during startup weekly reset check:", error);
    throw error;
  }
}