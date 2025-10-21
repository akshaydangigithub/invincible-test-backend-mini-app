import { NextFunction, Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import UpdateTokenService from "../services/UpdateToken.service";
import { updateTokenValidation } from "../utils/validation";

class UpdateTokenController {
  updateQuizToken = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const tokenData = req.user;
      // Assuming UpdateTokenService is already imported
      if (!tokenData) {
        return res.status(400).json({ message: "No token data provided" });
      }
      const result = updateTokenValidation.parse(req.body);
      await UpdateTokenService.quiz(tokenData, result, res);
    }
  );

  updateSpinToken = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const user = req.user;

      if (!user || !user.id) {
        return res.status(401).json({ message: "Unauthorized user" });
      }

      let result;
      try {
        result = updateTokenValidation.parse(req.body);
      } catch (err: any) {
        return res
          .status(400)
          .json({ message: "Invalid token data", error: err.errors });
      }

      return UpdateTokenService.spinWheel(user.id, result.token, res);
    }
  );

  updateBookReadingToken = catchAsync(
    async (req: any, res: Response, next: NextFunction) => {
      const tokenData = req.user;
      
      if (!tokenData) {
        return res.status(400).json({ message: "No token data provided" });
      }

      // Validate short-lived reading session token
      const hdrToken = req.headers["x-reading-token"] as string | string[] | undefined;
      const hdrBook = req.headers["x-book-id"] as string | string[] | undefined;
      const readingToken = Array.isArray(hdrToken) ? hdrToken[0] : hdrToken || req.body?.readingToken;
      const bookId = Array.isArray(hdrBook) ? hdrBook[0] : hdrBook || req.body?.bookId;
      await UpdateTokenService.bookReading(tokenData, res, readingToken || "", bookId || "");
    }
  );
}
export default new UpdateTokenController();
