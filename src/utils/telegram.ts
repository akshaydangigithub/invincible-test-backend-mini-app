import axios from "axios";
import { User } from "../models/User.models";

/**
 * Sends a Telegram message to a user notifying that their daily spin is available.
 * The message includes an inline button that opens the provided URL.
 *
 * @param userId MongoDB user _id string
 * @param url URL to open when the user taps the inline button
 */
export async function notifySpinAvailable(userId: string, url: string): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN in environment" };
    }

    // Look up the user's Telegram ID
    const user = await User.findById(userId).select("telegramId");
    if (!user) {
      return { ok: false, error: "User not found" };
    }
    if (!user.telegramId) {
      return { ok: false, error: "User has no telegramId linked" };
    }

    const chatId = user.telegramId;

    const text = `🎉 Your daily spin is ready!

💫 Spin the wheel to win exciting rewards:
• Points and tokens
• Special bonuses
• Daily prizes

Don't miss out on your chance to win! 🎯`;
    
    // Use web_app button to open Mini App inside Telegram (same as "Play Now")
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: "🎡 Spin The Wheel",
            web_app: { url },
          } as any,
        ],
      ],
    };

    const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const { data } = await axios.post(apiUrl, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });

    if (data?.ok) {
      return { ok: true, messageId: data.result?.message_id };
    }
    return { ok: false, error: data?.description || "Unknown Telegram API error" };
  } catch (error: any) {
    const message = error?.response?.data?.description || error?.message || String(error);
    return { ok: false, error: message };
  }
}

export default notifySpinAvailable;


