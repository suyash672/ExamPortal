import { Router } from "express";
import {
  beginTest,
  enrollInTest,
  getAttempt,
  getAvailableTests,
  saveAnswer,
  submitAttempt,
  logActivity
} from "../controllers/student.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  beginTestSchema,
  enrollSchema,
  saveAnswerSchema,
  submitAttemptSchema
} from "../validators/student.validators";

const studentRouter = Router();

studentRouter.use("/api/student", requireAuth, requireRole("STUDENT"));

studentRouter.get("/api/student/tests", getAvailableTests);
studentRouter.post("/api/student/enroll", validate(enrollSchema), enrollInTest);
studentRouter.post("/api/student/begin", validate(beginTestSchema), beginTest);
studentRouter.get("/api/student/attempt/:attemptId", getAttempt);
studentRouter.post("/api/student/answer", validate(saveAnswerSchema), saveAnswer);
studentRouter.post("/api/student/submit", validate(submitAttemptSchema), submitAttempt);
studentRouter.post("/api/student/attempt/:attemptId/activity", logActivity);

export default studentRouter;
