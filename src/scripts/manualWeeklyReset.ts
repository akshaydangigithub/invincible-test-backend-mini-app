
import mongoose from "mongoose";
import WeeklyResetService from "../services/WeeklyReset.service";
import dotenv from "dotenv";

dotenv.config();

async function manualWeeklyReset() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI!); 
    console.log("✅ Connected to MongoDB");

    console.log("🔄 Performing manual weekly reset...");
    await WeeklyResetService.resetWeeklyTokens();
    
    console.log("✅ Manual weekly reset completed successfully");
    
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Manual weekly reset failed:", error);
    process.exit(1);
  }
}

manualWeeklyReset();