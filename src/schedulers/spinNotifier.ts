import { User } from "../models/User.models";
import notifySpinAvailable from "../utils/telegram";
import { isConnected } from "../utils/database";

// Runs periodically to notify users when their daily spin is available.
// Uses spinNotifiedAt to avoid duplicate notifications within the same window.

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function startSpinNotifierScheduler(spinUrl: string) {
  async function tick() {
    try {
      // Check if database is connected before proceeding
      if (!isConnected()) {
        console.warn("⚠️ Database not connected, skipping spin notifier tick");
        return;
      }

      const now = new Date();
      const cutoff = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

      // Find users who:
      // 1) never spun (lastSpinAt null/undefined) and not notified recently, or
      // 2) lastSpinAt <= now - 24h and not notified after that lastSpinAt
      const candidates = await User.find({
        telegramId: { $exists: true, $ne: null },
        $or: [
          { lastSpinAt: { $in: [null, undefined] }, spinNotifiedAt: { $exists: false } },
          {
            lastSpinAt: { $lte: cutoff },
            $or: [
              { spinNotifiedAt: { $exists: false } },
              { spinNotifiedAt: { $lt: cutoff } },
            ],
          },
        ],
      }).select("_id telegramId lastSpinAt spinNotifiedAt").limit(3000  );

      console.log(`📊 Found ${candidates.length} users eligible for spin notifications`);

      for (const user of candidates) {
        const notifyResult = await notifySpinAvailable(String(user._id), spinUrl);
        if (notifyResult.ok) {
          // Mark notified to prevent repeats until next eligibility window
          user.spinNotifiedAt = new Date();
          await user.save();
        }
      }
    } catch (err) {
      console.error("Spin notifier tick failed:", err);
    }
  }

  // Run immediately, then every 15 minutes
  tick();
  return setInterval(tick, FIFTEEN_MINUTES_MS);
}

export default startSpinNotifierScheduler;


