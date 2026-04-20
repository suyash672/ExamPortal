import { Router } from "express";
import {
  createTest,
  deleteTest,
  getTestById,
  getTests
} from "../controllers/test.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createTestSchema } from "../validators/test.validators";

const testRouter = Router();

testRouter.use("/api/tests", requireAuth, requireRole("TEACHER"));

testRouter.get("/api/tests", getTests);
testRouter.post("/api/tests", validate(createTestSchema), createTest);
testRouter.get("/api/tests/:id", getTestById);
testRouter.delete("/api/tests/:id", deleteTest);

export default testRouter;
