import { Router } from "express";
import { assistantRoute } from "./Assistant.route";
import { UserRoute } from "./User.routes";
import { UpdateTokenRoute } from "./UpdateToken.route";
import { BookRoute } from "./Book.route";
import { IntegrationRoute } from "./Integration.route";
import { AuthRoute } from "./Auth.routes";

const rootRoute = Router();

// rootRoute.use("/assistant", assistantRoute);
rootRoute.use("/user", UserRoute);
rootRoute.use("/update-result", UpdateTokenRoute);
rootRoute.use("/book", BookRoute);
rootRoute.use("/integration", IntegrationRoute);
rootRoute.use("/auth", AuthRoute);

export { rootRoute };
