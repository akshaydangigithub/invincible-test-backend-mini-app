import { Router } from "express";
import jwtUtils from "../utils/jwtUtils";
import catchAsync from "../utils/catchAsync";
import BookController from "../controllers/Book.controller";
import { User } from "../models/User.models";
import jwt from "jsonwebtoken";

export const BookRoute = Router();

// 🚀 Public routes
BookRoute.get("/", BookController.getAllBooks);
BookRoute.get("/:id", BookController.getBookById);

// 🔒 Protected book management routes
BookRoute.post(
  "/",
  catchAsync(jwtUtils.jwtMiddleware),
  BookController.createBook
);

// 🔒 Create a short-lived reading session token (10m TTL)
BookRoute.post(
  "/reading-session",
  catchAsync(jwtUtils.jwtMiddleware),
  catchAsync(async (req: any, res) => {
    const user = req.user;
    const { bookId } = req.body || {};
    if (!bookId) {
      return res.status(400).json({ message: "bookId is required" });
    }

    const nonce = Math.random().toString(36).slice(2);
    await User.findByIdAndUpdate(user._id, { $set: { readingSessionNonce: nonce } });

    const payload = { userId: String(user._id), bookId: String(bookId), nonce };
    const token = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: "10m" });
    return res.status(200).json({ readingToken: token, nonce });
  })
);

// 🔒 Example: if you want protected routes for creating/updating books
// BookRoute.use(catchAsync(jwtUtils.jwtMiddleware));
// BookRoute.post("/", BookController.createBook);
// BookRoute.delete("/:id", BookController.deleteBook);
