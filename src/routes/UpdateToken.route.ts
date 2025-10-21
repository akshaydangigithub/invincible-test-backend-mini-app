import { Router } from "express";
import jwtUtils from "../utils/jwtUtils";
import catchAsync from "../utils/catchAsync";

import UpdateTokenController from "../controllers/UpdateToken.controller";
export const UpdateTokenRoute = Router();

UpdateTokenRoute.use(catchAsync(jwtUtils.jwtMiddleware));

UpdateTokenRoute.post("/quiz", UpdateTokenController.updateQuizToken);
UpdateTokenRoute.post("/spin", UpdateTokenController.updateSpinToken);
UpdateTokenRoute.post("/book-reading", UpdateTokenController.updateBookReadingToken);
