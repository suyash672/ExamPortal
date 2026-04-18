import { Router } from "express";
import {
  createModule,
  deleteModule,
  getModules,
  updateModule
} from "../controllers/module.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  requireModuleOwnership,
  requireSubjectOwnership
} from "../middleware/ownership";

const moduleRouter = Router();

moduleRouter.use("/api/subjects", requireAuth, requireRole("TEACHER"));
moduleRouter.use("/api/modules", requireAuth, requireRole("TEACHER"));

moduleRouter.get(
  "/api/subjects/:subjectId/modules",
  requireSubjectOwnership,
  getModules
);
moduleRouter.post(
  "/api/subjects/:subjectId/modules",
  requireSubjectOwnership,
  createModule
);
moduleRouter.put("/api/modules/:id", requireModuleOwnership, updateModule);
moduleRouter.delete("/api/modules/:id", requireModuleOwnership, deleteModule);

export default moduleRouter;
