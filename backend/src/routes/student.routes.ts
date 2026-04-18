import { Router } from "express";
import {
  beginTest,
  enrollInTest,
  getAttempt,
  getAvailableTests,
  saveAnswer,
  submitAttempt
} from "../controllers/student.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const studentRouter = Router();

studentRouter.use("/api/student", requireAuth, requireRole("STUDENT"));

studentRouter.get("/api/student/tests", getAvailableTests);
studentRouter.post("/api/student/enroll", enrollInTest);
studentRouter.post("/api/student/begin", beginTest);
studentRouter.get("/api/student/attempt/:attemptId", getAttempt);
studentRouter.post("/api/student/answer", saveAnswer);
studentRouter.post("/api/student/submit", submitAttempt);

export default studentRouter;
