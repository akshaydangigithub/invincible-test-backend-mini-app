// src/routes/Integration.routes.ts
import { Router } from "express";
import jwtUtils from "../utils/jwtUtils";
import catchAsync from "../utils/catchAsync";
import IntegrationController from "../controllers/Integration.controller";

export const IntegrationRoute = Router();

// Protect all integration routes with JWT middleware
IntegrationRoute.use(catchAsync(jwtUtils.jwtMiddleware));

// Award Telegram follow reward (+500 tokens once)
IntegrationRoute.post(
  "/telegram/reward",
  IntegrationController.rewardTelegramFollow
);

// Check Telegram channel membership (no reward)
IntegrationRoute.get(
  "/telegram/check",
  IntegrationController.checkTelegramFollow
);

// Twitter task: start and verify
IntegrationRoute.post(
  "/twitter/start",
  IntegrationController.startTwitterTask
);

IntegrationRoute.post(
  "/twitter/verify",
  IntegrationController.verifyTwitterTask
);

IntegrationRoute.get(
  "/twitter/status",
  IntegrationController.getTwitterStatus
);

// Medium task: start, verify, status
IntegrationRoute.post(
  "/medium/start",
  IntegrationController.startMediumTask
);

IntegrationRoute.post(
  "/medium/verify",
  IntegrationController.verifyMediumTask
);

IntegrationRoute.get(
  "/medium/status",
  IntegrationController.getMediumStatus
);

// Discord task: start, verify, status
IntegrationRoute.post(
  "/discord/start",
  IntegrationController.startDiscordTask
);

IntegrationRoute.post(
  "/discord/verify",
  IntegrationController.verifyDiscordTask
);

IntegrationRoute.get(
  "/discord/status",
  IntegrationController.getDiscordStatus
);

// Instagram task: start, verify, status
IntegrationRoute.post(
  "/instagram/start",
  IntegrationController.startInstagramTask
);

IntegrationRoute.post(
  "/instagram/verify",
  IntegrationController.verifyInstagramTask
);

IntegrationRoute.get(
  "/instagram/status",
  IntegrationController.getInstagramStatus
);

// LinkedIn task: start, verify, status
IntegrationRoute.post(
  "/linkedin/start",
  IntegrationController.startLinkedInTask
);

IntegrationRoute.post(
  "/linkedin/verify",
  IntegrationController.verifyLinkedInTask
);

IntegrationRoute.get(
  "/linkedin/status",
  IntegrationController.getLinkedInStatus
);