import { Telegraf } from "telegraf";
import { Agent as HttpsAgent } from "https";

// ✅ Replace with your new token
const bot = new Telegraf(
  "7831841072:AAE0XoEZrwqhBfRyNrQ3WtN6qAM3iG-kFVo"
) as any;

// Force IPv4 polling to avoid MacOS/VPN hanging issue
bot.telegram.options.agent = new HttpsAgent({ family: 4 });

export default bot;
