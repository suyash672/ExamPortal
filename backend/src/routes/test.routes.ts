import { Router } from "express";
import {
  createTest,
  deleteTest,
  getTestById,
  getTests,
  releaseTestResults,
  getTestStatistics,
  updateTestSettings
} from "../controllers/test.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createTestSchema } from "../validators/test.validators";

const testRouter = Router();

testRouter.use("/api/tests", requireAuth, requireRole("TEACHER"));

testRouter.get("/api/tests", getTests);
testRouter.post("/api/tests", validate(createTestSchema), createTest);
testRouter.get("/api/tests/:id", getTestById);
testRouter.get("/api/tests/:id/statistics", getTestStatistics);
testRouter.patch("/api/tests/:id/settings", updateTestSettings);
testRouter.delete("/api/tests/:id", deleteTest);
testRouter.post("/api/tests/:id/release-results", releaseTestResults);

export default testRouter;
