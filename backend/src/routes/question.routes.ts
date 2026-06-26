import multer from "multer";
import { Router } from "express";
import { z } from "zod";
import {
  createQuestion,
  deleteQuestion,
  getQuestions,
  updateQuestion,
  deduplicateQuestions,
  bulkSaveQuestions
} from "../controllers/question.controller";
import { importCsv } from "../controllers/questioncsv.controller";
import { importMoodleHtml } from "../controllers/questionhtml.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireQbOwnership, requireQuestionOwnership } from "../middleware/ownership";
import { validate } from "../middleware/validate";
import { createQuestionSchema } from "../validators/question.validators";

const upload = multer({ storage: multer.memoryStorage() });
const questionRouter = Router();

questionRouter.use("/api/banks", requireAuth, requireRole("TEACHER"));
questionRouter.use("/api/questions", requireAuth, requireRole("TEACHER"));

questionRouter.get("/api/banks/:qbId/questions", requireQbOwnership, getQuestions);
questionRouter.post(
  "/api/banks/:qbId/questions",
  requireQbOwnership,
  (req, _res, next) => {
    req.body = { ...req.body, qbId: req.params.qbId };
    next();
  },
  validate(createQuestionSchema),
  createQuestion
);
questionRouter.put(
  "/api/questions/:id",
  requireQuestionOwnership,
  validate(createQuestionSchema),
  updateQuestion
);
questionRouter.post(
  "/api/banks/:qbId/questions/bulk",
  requireQbOwnership,
  bulkSaveQuestions
);
questionRouter.delete("/api/questions/:id", requireQuestionOwnership, deleteQuestion);
questionRouter.post(
  "/api/questions/import-csv",
  upload.single("file"),
  validate(
    z.object({
      qbId: z.string().regex(/^[a-fA-F0-9]{24}$/)
    })
  ),
  importCsv
);

questionRouter.post(
  "/api/questions/deduplicate",
  validate(
    z.object({
      qbId: z.string().regex(/^[a-fA-F0-9]{24}$/)
    })
  ),
  deduplicateQuestions
);

questionRouter.post(
  "/api/questions/import-moodle-html",
  upload.single("file"),
  validate(
    z.object({
      qbId: z.string().regex(/^[a-fA-F0-9]{24}$/)
    })
  ),
  importMoodleHtml
);

export default questionRouter;
