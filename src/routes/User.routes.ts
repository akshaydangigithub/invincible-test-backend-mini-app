import { Router } from "express";
import jwtUtils from "../utils/jwtUtils";
import catchAsync from "../utils/catchAsync";
import UserController from "../controllers/User.controller";

export const UserRoute = Router();

// 🚀 Public auth routes
UserRoute.post("/auth/register", UserController.registerEmailUser);
UserRoute.post("/auth/login-email", UserController.loginEmailUser);

UserRoute.get("/auth/nonce/:address", UserController.nonceWalletUser); // ← fix this!
UserRoute.post("/auth/login-telegram", UserController.telegramLoginOrRegister);

// Referral is now handled server-side during login; public referral endpoint removed

// 🚀 Protect following routes with JWT middleware
UserRoute.use(catchAsync(jwtUtils.jwtMiddleware));

// 🚀 Example protected routes:
UserRoute.post("/connect-wallet", UserController.loginWalletUser);
// Temporary alias: allow legacy path `/auth/connect-wallet` and accept address from query
UserRoute.post("/auth/connect-wallet", (req, res, next) => {
  if (!req.body || !req.body.address) {
    (req as any).body = { ...(req as any).body, address: String(req.query.address || "") };
  }
  return (UserController as any).loginWalletUser(req, res, next);
});
// GET alias for clients calling with query params
UserRoute.get("/auth/connect-wallet", (req, res, next) => {
  (req as any).body = { ...(req as any).body, address: String(req.query.address || "") };
  return (UserController as any).loginWalletUser(req, res, next);
});
UserRoute.put("/details", UserController.updateUserDetails);
UserRoute.get("/details", UserController.getUserDetails);
UserRoute.get("/profile", UserController.getProfile);
UserRoute.get("/leaderboard", UserController.getLeaderboard);
UserRoute.get("/referrals", UserController.getReferrals);
UserRoute.get("/referral-level-rewards", UserController.getReferralLevelRewards);
UserRoute.get("/:id", UserController.getUserById);
UserRoute.put("/:id", UserController.updateUsername);
UserRoute.post("/logout", UserController.logoutUser);
UserRoute.post("/disconnect-wallet", UserController.disconnectWallet);
UserRoute.post("/mark-premium", UserController.markPremium);
UserRoute.post("/unlock-book", UserController.unlockBook);
UserRoute.post("/agreement", UserController.agreeToTerms);
