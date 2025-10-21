import { NextFunction, Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import { assistantResValidation } from "../utils/validation";
import AssistantService from "../services/Assistant.service";

class AssistantController {
  // getGPTResponse = catchAsync(
  //   async (req: Request, res: Response, next: NextFunction) => {
  //     const result = assistantResValidation.parse(req.body);
  //     await AssistantService.getGPTResponse(result, res);
  //   }
  // );
}

export default new AssistantController();
