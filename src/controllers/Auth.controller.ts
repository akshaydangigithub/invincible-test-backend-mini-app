import { NextFunction, Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import crypto from "crypto";
import jwtUtils from "../utils/jwtUtils";
import { User } from "../models/User.models";
import ResponseHandler from "../utils/apiResponse";
import dotenv from "dotenv";

dotenv.config();

const FRONTEND_ORIGIN = process.env.WEBSITE_FRONTEND_URL || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

class AuthController {
  getLoginWidget = async (req, res) => {
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").replace(
      /^@/,
      ""
    );
    const backendUrl = process.env.BACKEND_URL || "";

    const html = `<!DOCTYPE html>
<html>
  <head><title>Telegram Login</title></head>
  <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
    <script async src="https://telegram.org/js/telegram-widget.js?15"
      data-telegram-login="${botUsername}"
      data-size="large"
      data-userpic="true"
      data-request-access="write"
      data-auth-url="${backendUrl}/api/v1/auth/telegram-callback">
    </script>
    <p>If widget doesn’t appear, check BotFather domain settings.</p>
  </body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  };

  telegramCallback = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const query = req.query;

      // Build payload map of strings
      const payload: Record<string, string> = {};
      Object.keys(query).forEach((k) => {
        if (k === "hash") return;
        const v = query[k];
        // decode URI components
        const value = Array.isArray(v)
          ? v.map(decodeURIComponent).join(",")
          : decodeURIComponent(String(v ?? ""));
        payload[k] = value;
      });

      // Construct data_check_string
      const keys = Object.keys(payload).sort();
      const dataCheckString = keys.map((k) => `${k}=${payload[k]}`).join("\n");

      // HMAC verify...
      const secretKey = crypto.createHash("sha256").update(BOT_TOKEN).digest();
      const hmac = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");
      const receivedHash = String(query.hash ?? "");

      const hmacBuf = Buffer.from(hmac, "hex");
      const hashBuf = Buffer.from(receivedHash, "hex");

      if (
        hmacBuf.length !== hashBuf.length ||
        !crypto.timingSafeEqual(hmacBuf, hashBuf)
      ) {
        console.warn("telegram auth hash mismatch", {
          receivedHash,
          computed: hmac,
        });
        res.status(403).send("Invalid Telegram auth data (hash mismatch)");
        return;
      }

      // auth_date check
      const authDate = parseInt(String(payload.auth_date || "0"), 10);
      const now = Math.floor(Date.now() / 1000);
      const MAX_AGE = 24 * 60 * 60;
      if (!authDate || Math.abs(now - authDate) > MAX_AGE) {
        res.status(400).send("Auth data too old");
        return;
      }

      // normalize and issue token (call upstream or sign a local JWT)
      const telegramData = {
        telegramId: payload.id,
        telegramFirstName: payload.first_name || "",
        telegramLastName: payload.last_name || "",
        telegramUsername: payload.username || "",
        telegramPhotoUrl: payload.photo_url || "",
      };

      if (!telegramData.telegramId) {
        ResponseHandler.badRequest(res, "telegramId is required");
        return;
      }

      let user = await User.findOne({ telegramId: telegramData.telegramId });

      if (!user) {
        // Create new user
        user = await User.create({
          telegramId: telegramData.telegramId,
          telegramFirstName: telegramData.telegramFirstName,
          telegramLastName: telegramData.telegramLastName,
          telegramUsername: telegramData.telegramUsername,
          telegramPhotoUrl: telegramData.telegramPhotoUrl,
        });
      }

      const token = jwtUtils.generateToken({ id: user._id });
      res.cookie("invincible-token", token);

      const appToken = token;

      const html = `<!doctype html><html><body>
                    <script>
                      (function(){
                        try {
                          const payload = { type: "telegram-login-success", token: ${JSON.stringify(
                            appToken
                          )} };
                          if (window.opener && !window.opener.closed) {
                            window.opener.postMessage(payload, ${JSON.stringify(
                              FRONTEND_ORIGIN
                            )});
                            window.close();
                          } else {
                            document.body.innerText = "Login complete. Close this window.";
                          }
                        } catch (e) {
                          console.error(e);
                          document.body.innerText = "Login error";
                        }
                      })();
                    </script>
                    </body></html>`;

      res.setHeader("Content-Type", "text/html");
      res.send(html);
      // Do not return res.send or any value, just end the function
      return;
    }
  );
}

export default new AuthController();
