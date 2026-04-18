import { Router } from "express";
import {
  login,
  logout,
  refresh,
  register
} from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post("/api/auth/register", register);
authRouter.post("/api/auth/login", login);
authRouter.post("/api/auth/refresh", refresh);
authRouter.post("/api/auth/logout", logout);

export default authRouter;
