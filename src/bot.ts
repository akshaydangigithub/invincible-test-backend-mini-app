// bot.ts

import { Telegraf, Markup } from "telegraf";
import { Agent as HttpsAgent } from "https";
import mongoose from "mongoose";
// Use the shared User model to ensure same collection/schema as the backend
import { User } from "./models/User.models";
import dotenv from "dotenv";
dotenv.config();

// ===== CONFIG =====
// DO NOT hardcode secrets. Fail fast if missing in prod.
const BOT_TOKEN = "7644950140:AAHWt7aFkKsPrneRTh5CJUawwQZghcub3-8";
// IMPORTANT: use the SAME DB name as your backend (pin it in the URI!)
const MONGO_URI = "mongodb+srv://invincibleread:vLHC3oTAUqj94yO9@invincible.vybaj.mongodb.net/invincibleNFTProd?retryWrites=true&w=majority&appName=Invincible";


  // process.env.MONGO_URI;
   // ||
  // "mongodb://127.0.0.1:27017/invincibleNFTProd?appName=Invincible";

const REFERRAL_DEBUG = process.env.REFERRAL_DEBUG === "1";

function dlog(...args: any[]) {
  if (REFERRAL_DEBUG) console.log("[referral]", ...args);
}

// ===== SAFETY CHECKS =====
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is required. Set it in env.");
  process.exit(1);
}

mongoose.set("strictQuery", true);

// ===== BOT INIT =====
const bot = new Telegraf(BOT_TOKEN);
// Force IPv4 polling (type cast for TS)
((bot.telegram as any).options ||= {}).agent = new HttpsAgent({ family: 4 });

// ===== INTRO MESSAGE =====
const introText = `
🔥 Welcome to Invincible Read 🔥

📖 Read. 💰 Earn. 🚀 Level Up!

Turn your reading habit into real rewards! 💎
🎯 What You Can Do:
📚 Read Books → Earn points for every chapter
🧠 Take Quizzes → Bonus points for smart answers
🎡 Daily Spin → Guaranteed rewards every 24hrs
⚡ Complete Tasks → Extra rewards for challenges
🏆 Compete → Climb leaderboards & unlock premiums

🎁 Connect your wallet now!
`;

// ===== MONGO =====
let mongoOk = false;

async function connectMongo() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGO_URI, {
        autoIndex: true,
        serverSelectionTimeoutMS: 5000,
      });
      const dbName = "invincibleNFTProd"; // Ensure this matches your backend DB name
      console.log("✅ Mongo connected:", dbName);
      console.log("ℹ️ Using collection:", User.collection.collectionName);
      const collections = await mongoose.connection.db
        .listCollections()
        .toArray();
      const userCollection = collections.find(
        (c) => c.name === "newusers"
      );
      console.log(
        "ℹ️ User collection present:",
        !!userCollection,
        "name:",
        userCollection?.name
      );

    

    }
    mongoOk = true;
  } catch (e: any) {
    console.warn("⚠️ Mongo connect failed, continuing without DB:", e?.message || e);
    mongoOk = false;
  }
}

// ===== HELPERS =====
function getStartPayload(ctx: any) {
  if (ctx && typeof ctx.startPayload === "string") {
    return ctx.startPayload; // e.g. "r123456789"
  }
  const msg = ctx.update && ctx.update.message;
  const text = msg && msg.text;
  if (!text || !text.startsWith("/start")) return null;

  const entities = msg.entities || [];
  let afterCmd = text;
  if (entities[0]?.type === "bot_command") {
    const cmdLen = entities[0].length;
    afterCmd = text.slice(cmdLen).trim();
  } else {
    afterCmd = text.split(/\s+/, 2)[1] || "";
  }
  return afterCmd || null;
}

async function upsertUserFromCtx(ctx: any) {
  const tg = ctx.from;
  const update = {
    telegramFirstName: tg.first_name,
    telegramLastName: tg.last_name,
    telegramUsername: tg.username,
  };
  const user = await User.findOneAndUpdate(
    { telegramId: tg.id },
    { $setOnInsert: { telegramId: tg.id }, $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return user;
}

// ===== Referral core (fixed, idempotent, tolerant of unset fields) =====
/**
 * Applies a referral exactly once:
 * - joins joiner -> referrer if joiner hasn't used a referral
 * - credits referrer once per joiner
 *
 * Notes:
 * - This function also writes `referedBy` & `referedUsers` (common misspells) to be tolerant
 *   if your schema used those names historically. Prefer fixing schema, but this unblocks you.
 * - Ensure your schema types are ObjectId for `referredBy` and `referredUsers`:
 *     referredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
 *     referredUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }]
 */
async function applyReferralOnce(joiner: any, referrerTelegramId: number) {
  if (!joiner || !referrerTelegramId) return { applied: false, reason: "bad_inputs" };
  if (joiner.telegramId === referrerTelegramId) return { applied: false, reason: "self" };
  
  const referrer = await User.findOne({ telegramId: Number(referrerTelegramId) });
  if (!referrer) return { applied: false, reason: "no_referrer" };

  const joinerId = joiner._id;
  const referrerId = referrer._id;
  // 1) Only add to referrer's list - let backend handle referral binding and rewards
  const claimRes = await User.updateOne(
    {
      _id: joinerId,
      $or: [
        { referralUsed: { $exists: false } },
        { referralUsed: { $ne: true } },
        { referredBy: { $exists: false } },
        { referredBy: null }
      ],
    } as any,
    {
      $set: {
        // Don't set referralUsed or referredBy here - let backend handle it
        // Only mark that this user came via bot referral
        botReferralPending: true,
      },
    }
  );
  dlog("claimRes", claimRes);

  if (claimRes.modifiedCount > 0) {
    // 2) Mark user for backend referral processing (backend will handle referredUsers and rewards)
    dlog("User marked for backend referral processing");
    return {
      applied: true,
      reason: "marked_for_backend_processing",
    };
  }

  // 3) If already pointing to this referrer, try to credit (idempotent)
  const fresh = await User.findById(joinerId).select("referredBy referedBy").lean();
  const normalizedJoinerRef =
    (fresh as any)?.referredBy?.toString?.() || (fresh as any)?.referedBy?.toString?.();
  const same = normalizedJoinerRef && normalizedJoinerRef === referrerId.toString();

  if (same) {
    // User already has botReferralPending set
    dlog("User already marked for backend processing");
    return {
      applied: false,
      reason: "already_marked_for_processing",
    };
  }

  // 4) Already used someone else’s referral
  return { applied: false, reason: "already_used_other" };
}

// ===== Middleware =====
bot.use(async (_ctx, next) => {
  await next();
});

// ===== /start handler =====
bot.start(async (ctx) => {
  try {
    if (!mongoOk) await connectMongo();

    const payload = getStartPayload(ctx);

    const refStrForWeb = (payload ? (payload.startsWith("r") ? payload.slice(1) : payload) : "").trim();
    const playNowUrl = `https://minigame.invincibleread.com${
      refStrForWeb ? `?referralUserId=${encodeURIComponent(refStrForWeb)}` : ""
    }`;

    await ctx.reply(introText, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.webApp("🎮 Play Now", playNowUrl)],
        [
          Markup.button.url("🌐 Website", "https://invincibleread.com"),
          Markup.button.url("𝕏 Twitter", "https://x.com/invincible_read"),
        ],
        [
          Markup.button.url("✈️ Telegram", "https://t.me/invincible_read"),
          Markup.button.url("🟣 Discord", "https://discord.com/invite/jGtrk7TejJ"),
        ],
        [
          Markup.button.webApp(
            "💸 Invest Now",
            "https://docs.google.com/forms/d/e/1FAIpQLSebLwzTJa8jMvwk-J-RhkMX77OvGRsdcxboAjVznqlMDvgTeQ/viewform"
          ),
        ],
      ]),
    });

    // Handle referral if payload exists
    if (!payload || !mongoOk) return;

    const referrerIdStr = (payload.startsWith("r") ? payload.slice(1) : payload).trim();
    const referrerIdNum = Number(referrerIdStr);
    if (!Number.isFinite(referrerIdNum) || !referrerIdNum) return;

    // Upsert joiner and apply referral
    const joiner = await upsertUserFromCtx(ctx);

    if (REFERRAL_DEBUG) {
      const joinerBefore = await User.findOne({ telegramId: ctx.from.id })
        .select("telegramId referredBy referedBy referralUsed")
        .lean();
      dlog("JOINER BEFORE:", joinerBefore);
    }

    const result = await applyReferralOnce(joiner, referrerIdNum);

    if (REFERRAL_DEBUG) {
      const joinerAfter = await User.findById(joiner._id)
        .select("telegramId referredBy referedBy referralUsed")
        .lean();
      const referrerAfter = await User.findOne({ telegramId: referrerIdNum })
        .select("telegramId referredUsers referedUsers referralCount token")
        .lean();
      dlog("JOINER AFTER:", joinerAfter);
      dlog("REFERRER AFTER:", {
        telegramId: referrerAfter?.telegramId,
        referredUsersLen: referrerAfter?.referredUsers?.length,
        referedUsersLen: (referrerAfter as any)?.referedUsers?.length,
        referralCount: referrerAfter?.referralCount,
        token: referrerAfter?.token,
      });
    }
  } catch (err) {
    console.error("❌ Error in /start handler:", err);
  }
});

// ===== Spin Availability =====
interface SpinCheckResult {
  isAvailable: boolean;
  hoursLeft?: number;
  lastSpinAt?: Date | null;
}

async function checkSpinAvailability(userId: string | number): Promise<SpinCheckResult | null> {
  if (!mongoOk) await connectMongo();

  const user = await User.findOne({ telegramId: userId });
  if (!user) return null;

  const now = new Date();
  const lastSpin = user.lastSpinAt ? new Date(user.lastSpinAt) : null;

  if (!lastSpin || now.getTime() - lastSpin.getTime() >= 24 * 60 * 60 * 1000) {
    return { isAvailable: true, lastSpinAt: lastSpin };
  } else {
    const hoursLeft = 24 - Math.floor((now.getTime() - lastSpin.getTime()) / (60 * 60 * 1000));
    return { isAvailable: false, hoursLeft, lastSpinAt: lastSpin };
  }
}

async function sendSpinNotification(telegramId: number, ctx?: any) {
  const message = `🎉 Your daily spin is ready!

💫 Spin the wheel to win exciting rewards.

Don't miss out on your chance to win! 🎯`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.webApp("🎡 Spin The Wheel", "https://minigame.invincibleread.com/spin")],
  ]);

  if (ctx) {
    await ctx.reply(message, { parse_mode: "Markdown", ...keyboard });
  } else {
    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: "Markdown",
      ...keyboard,
    });
  }
}

bot.command("spin", async (ctx) => {
  try {
    const result = await checkSpinAvailability(ctx.from.id);

    if (!result) {
      return ctx.reply("❌ Please start the bot first using /start");
    }

    if (result.isAvailable) {
      await sendSpinNotification(ctx.from.id, ctx);
    } else {
      await ctx.reply(
        `⏳ Your next spin will be available in ${result.hoursLeft} hour${
          result.hoursLeft !== 1 ? "s" : ""
        }.`
      );
    }
  } catch (err) {
    console.error("❌ Error in /spin handler:", err);
    ctx.reply("Sorry, something went wrong while checking your spin status.");
  }
});

// ===== Daily Spin Check =====
async function checkAndNotifySpinAvailable() {
  try {
    if (!mongoOk) {
      console.log("❌ MongoDB not connected, skipping spin check");
      return;
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const eligibleUsers = await User.find({
      telegramId: { $exists: true, $ne: null },
      $and: [
        { $or: [{ lastSpinAt: { $lte: cutoff } }, { lastSpinAt: null }] },
        { $or: [{ spinNotifiedAt: { $lt: todayStart } }, { spinNotifiedAt: null }] },
      ],
    }).select("telegramId lastSpinAt spinNotifiedAt");

    for (const user of eligibleUsers) {
      try {
        const spinCheck = await checkSpinAvailability(user.telegramId);
        if (spinCheck?.isAvailable) {
          await sendSpinNotification(user.telegramId);

          await User.updateOne({ _id: user._id }, { $set: { spinNotifiedAt: new Date() } });
        }
      } catch (error: any) {
        if (!error?.message?.includes("blocked")) {
          console.error(`❌ Notification failed for user ${user.telegramId}:`, error?.message || error);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error in daily spin check:", err);
  }
}

// Run spin check on startup and then every 5 hours
setTimeout(async () => {
  await checkAndNotifySpinAvailable();
  setInterval(checkAndNotifySpinAvailable, 5 * 60 * 60 * 1000);
}, 5000);

// ===== BOOT =====
(async () => {
  await connectMongo();
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  } catch (e: any) {
    console.warn("Couldn't delete webhook:", e?.message || e);
  }
  const me = await bot.telegram.getMe();
  console.log(`🤖 Bot @${me.username} launching...`);

  await bot.launch({ dropPendingUpdates: true, allowedUpdates: ["message"] });
  console.log("✅ Bot launched.");
})().catch((err) => console.error("❌ Bot failed to launch:", err));

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

