// src/controllers/IntegrationController.ts
import { NextFunction, Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import IntegrationService from "../services/Integration.service";

class IntegrationController {
  // POST /integration/telegram/reward
  // Requires JWT (req.user set by your JWT middleware)
  rewardTelegramFollow = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      // No body required; relies on req.user (with telegramId)
      await IntegrationService.rewardTelegramFollow(req, res);
    }
  );

  // GET /integration/telegram/check
  // Optional helper to just verify membership (no reward)
  checkTelegramFollow = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.checkMembership(req, res);
    }
  );

  // POST /integration/twitter/start
  startTwitterTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.startTwitterTask(req, res);
    }
  );

  // POST /integration/twitter/verify
  verifyTwitterTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.verifyTwitterTask(req, res);
    }
  );

  // GET /integration/twitter/status
  getTwitterStatus = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.getTwitterStatus(req, res);
    }
  );

  // POST /integration/instagram/start
  startInstagramTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.startInstagramTask(req, res);
    }
  );

  // POST /integration/instagram/verify
  verifyInstagramTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.verifyInstagramTask(req, res);
    }
  );

  // GET /integration/instagram/status
  getInstagramStatus = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.getInstagramStatus(req, res);
    }
  );

  // POST /integration/linkedin/start
  startLinkedInTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.startLinkedInTask(req, res);
    }
  );

  // POST /integration/linkedin/verify
  verifyLinkedInTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.verifyLinkedInTask(req, res);
    }
  );

  // GET /integration/linkedin/status
  getLinkedInStatus = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.getLinkedInStatus(req, res);
    }
  );

  // POST /integration/medium/start
  startMediumTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.startMediumTask(req, res);
    }
  );

  // POST /integration/medium/verify
  verifyMediumTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.verifyMediumTask(req, res);
    }
  );

  // GET /integration/medium/status
  getMediumStatus = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.getMediumStatus(req, res);
    }
  );

  // POST /integration/discord/start
  startDiscordTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.startDiscordTask(req, res);
    }
  );

  // POST /integration/discord/verify
  verifyDiscordTask = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.verifyDiscordTask(req, res);
    }
  );

  // GET /integration/discord/status
  getDiscordStatus = catchAsync(
    async (req: any, res: Response, _next: NextFunction) => {
      await IntegrationService.getDiscordStatus(req, res);
    }
  );
}

export default new IntegrationController();
