import { Router } from "express";
import authController from "../controllers/Auth.controller";

export const AuthRoute = Router();

AuthRoute.get("/login-widget", authController.getLoginWidget);
AuthRoute.get("/telegram-callback", authController.telegramCallback);
