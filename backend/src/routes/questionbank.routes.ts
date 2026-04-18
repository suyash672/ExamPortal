import { Router } from "express";
import {
  createQb,
  deleteQb,
  getQbs,
  updateQb
} from "../controllers/questionbank.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireModuleOwnership, requireQbOwnership } from "../middleware/ownership";

const questionBankRouter = Router();

questionBankRouter.use("/api/modules", requireAuth, requireRole("TEACHER"));
questionBankRouter.use("/api/banks", requireAuth, requireRole("TEACHER"));

questionBankRouter.get(
  "/api/modules/:moduleId/banks",
  requireModuleOwnership,
  getQbs
);
questionBankRouter.post(
  "/api/modules/:moduleId/banks",
  requireModuleOwnership,
  createQb
);
questionBankRouter.put("/api/banks/:id", requireQbOwnership, updateQb);
questionBankRouter.delete("/api/banks/:id", requireQbOwnership, deleteQb);

export default questionBankRouter;
