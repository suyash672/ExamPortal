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
import { validate } from "../middleware/validate";
import { createModuleSchema, updateModuleSchema } from "../validators/module.validators";

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
  (req, _res, next) => {
    req.body = { ...req.body, subjectId: req.params.subjectId };
    next();
  },
  validate(createModuleSchema),
  createModule
);
moduleRouter.put(
  "/api/modules/:id",
  requireModuleOwnership,
  validate(updateModuleSchema),
  updateModule
);
moduleRouter.delete("/api/modules/:id", requireModuleOwnership, deleteModule);

export default moduleRouter;
