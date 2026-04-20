import rateLimit from "express-rate-limit";
import { Router } from "express";
import {
  login,
  logout,
  refresh,
  register
} from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { loginSchema, registerSchema } from "../validators/auth.validators";

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

const authRouter = Router();

authRouter.post("/api/auth/register", authRateLimiter, validate(registerSchema), register);
authRouter.post("/api/auth/login", authRateLimiter, validate(loginSchema), login);
authRouter.post("/api/auth/refresh", refresh);
authRouter.post("/api/auth/logout", logout);

export default authRouter;
