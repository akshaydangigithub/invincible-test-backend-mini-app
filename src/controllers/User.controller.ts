import { NextFunction, Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import { userRegisterValidation } from "../utils/validation";
import UserService from "../services/User.service";

class UserController {
  registerEmailUser = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const result = userRegisterValidation.parse(req.body);
      await UserService.registerEmailUser(result, res);
    }
  );

  getReferrals = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await UserService.getReferrals(userId, res);
    }
  );

  getReferralLevelRewards = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await UserService.getReferralLevelRewards(userId, res);
    }
  );

  loginEmailUser = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, password } = req.body;
      await UserService.loginEmailUser(email, password, res);
    }
  );

  nonceWalletUser = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const { address } = req.params; // ✅ not req.query
      await UserService.nonceWalletUser(address as string, res);
    }
  );

  loginWalletUser = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      await UserService.connectWalletToTelegramUser(
        req.user,
        req.body.address,
        res
      );
    }
  );

  getAllUsers = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      await UserService.getAllUsers(res);
    }
  );

  getUserById = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.params.id;
      await UserService.getUserById(userId, res);
    }
  );

  updateUsername = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.params.id;
      const { username } = req.body;
      await UserService.updateUsername(userId, username, res);
    }
  );

  getProfile = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id; // depends on auth middleware
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      await UserService.getProfile(userId, res);
    }
  );

  getLeaderboard = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).user?._id; // Extract userId from authenticated user
      await UserService.getLeaderboard(res, userId);
    }
  );

  logoutUser = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      await UserService.logoutUser(res);
    }
  );

  disconnectWallet = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      await UserService.disconnectWalletForUser(userId, res);
    }
  );

  telegramLoginOrRegister = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        telegramId,
        telegramFirstName,
        telegramLastName,
        telegramUsername,
        telegramPhotoUrl,
        referralCode,
      } = req.body;

      if (!telegramId) {
        return res.status(400).json({ message: "telegramId is required" });
      }

      await UserService.loginOrRegisterTelegramUser(
        {
          telegramId,
          telegramFirstName,
          telegramLastName,
          telegramUsername,
          telegramPhotoUrl,
          referralCode,
        },
        res
      );
    }
  );

  // Upgrade user to premium after client-side on-chain verification
  markPremium = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await UserService.setPremium(userId, res);
    }
  );

  // Unlock a single premium book for the current user (idempotent)
  unlockBook = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      const { bookId } = req.body || {};
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await UserService.unlockPremiumBook(userId, String(bookId || ""), res);
    }
  );

  // New endpoints for user details management
  updateUserDetails = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      const { fullName, email, walletAddress, mobileNumber, xUsername, walletConnected } =
        req.body || {};

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const updateData = {
        fullName,
        email,
        walletAddress,
        mobileNumber,
        xUsername,
        walletConnected
      };

      // Remove undefined fields
      Object.keys(updateData).forEach(
        (key) =>
          updateData[key as keyof typeof updateData] === undefined &&
          delete updateData[key as keyof typeof updateData]
      );

      await UserService.updateUserDetails(userId, updateData, res);
    }
  );

  getUserDetails = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      await UserService.getUserDetails(userId, res);
    }
  );
  // Agree to terms and conditions
  agreeToTerms = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await UserService.agreeToTerms(userId, res);
    }
  );

  // Referral application is handled within loginOrRegisterTelegramUser server-side only
}

export default new UserController();
