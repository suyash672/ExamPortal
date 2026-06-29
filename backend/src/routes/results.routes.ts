import { Router } from "express";
import {
  exportResultsCsv,
  getAttemptDetail,
  getTestResults,
  updateAttemptBlockStatus
} from "../controllers/results.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const resultsRouter = Router();

resultsRouter.use("/api/tests", requireAuth, requireRole("TEACHER"));

resultsRouter.get("/api/tests/:testId/results", getTestResults);
resultsRouter.get("/api/tests/:testId/results/export", exportResultsCsv);
resultsRouter.get("/api/tests/:testId/attempts/:attemptId", getAttemptDetail);
resultsRouter.post("/api/tests/:testId/attempts/:attemptId/block", updateAttemptBlockStatus);

export default resultsRouter;