import jwt from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import ResponseHandler from "./apiResponse";
import { User } from "../models/User.models";
// import User from "../models/UserM.model";

class JWTUtils {
  generateToken(payload: object) {
    return jwt.sign(payload, process.env.JWT_SECRET as string);
  }

  async jwtMiddleware(req: any, res: Response, next: NextFunction) {
    // 1. Check for token in Authorization header
    const authHeader = req.headers.authorization;
    // // TEMP DEBUG: Inspect incoming auth header and cookies to diagnose missing Bearer token
    // try {
    //   console.log("[Auth Debug] Authorization:", authHeader);
    //   console.log("[Auth Debug] Cookies:", req.cookies);
    // } catch (e) {
    //   // ignore logging failures
    // }
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // 2. Fallback to cookie if no auth header
    if (!token && req.cookies) {
      token = req.cookies["invincible-token"];
    }


    if (!token) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as jwt.JwtPayload;

      if (!decoded || !decoded.id) {
        return ResponseHandler.unauthorized(res, "Unauthorized", {});
      }

      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("JWT Middleware Error:", error);
      return res.status(401).json({ message: "Invalid token" });
    }
  }
}

export default new JWTUtils();
