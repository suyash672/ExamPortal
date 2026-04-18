import { Router } from "express";
import {
  createSubject,
  deleteSubject,
  getSubjects,
  updateSubject
} from "../controllers/subject.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireSubjectOwnership } from "../middleware/ownership";

const subjectRouter = Router();

subjectRouter.use("/api/subjects", requireAuth, requireRole("TEACHER"));

subjectRouter.get("/api/subjects", getSubjects);
subjectRouter.post("/api/subjects", createSubject);
subjectRouter.put("/api/subjects/:id", requireSubjectOwnership, updateSubject);
subjectRouter.delete(
  "/api/subjects/:id",
  requireSubjectOwnership,
  deleteSubject
);

export default subjectRouter;
