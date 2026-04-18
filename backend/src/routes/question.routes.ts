import multer from "multer";
import { Router } from "express";
import {
  createQuestion,
  deleteQuestion,
  getQuestions,
  updateQuestion
} from "../controllers/question.controller";
import { importCsv } from "../controllers/questioncsv.controller";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireQbOwnership, requireQuestionOwnership } from "../middleware/ownership";

const upload = multer({ storage: multer.memoryStorage() });
const questionRouter = Router();

questionRouter.use("/api/banks", requireAuth, requireRole("TEACHER"));
questionRouter.use("/api/questions", requireAuth, requireRole("TEACHER"));

questionRouter.get("/api/banks/:qbId/questions", requireQbOwnership, getQuestions);
questionRouter.post("/api/banks/:qbId/questions", requireQbOwnership, createQuestion);
questionRouter.put("/api/questions/:id", requireQuestionOwnership, updateQuestion);
questionRouter.delete("/api/questions/:id", requireQuestionOwnership, deleteQuestion);
questionRouter.post("/api/questions/import-csv", upload.single("file"), importCsv);

export default questionRouter;
