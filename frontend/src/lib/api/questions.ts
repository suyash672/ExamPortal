import api from "../axios";

export type McqQuestionOption = {
  id?: string;
  optionText: string;
  imageUrl?: string | null;
  scorePercent: number;
};

export type QuestionRecord = {
  id: string;
  qbId: string;
  type: "MCQ" | "TEXT";
  questionText: string;
  imageUrl?: string | null;
  createdAt: string;
  deletedAt: string | null;
  mcqOptions: McqQuestionOption[];
  acceptedAnswers: Array<{
    id?: string;
    answerText: string;
  }>;
};

export type QuestionPayload =
  | {
      qbId: string;
      type: "MCQ";
      questionText: string;
      imageUrl?: string | null;
      options: Array<{
        optionText: string;
        imageUrl?: string | null;
        scorePercent: number;
      }>;
    }
  | {
      qbId: string;
      type: "TEXT";
      questionText: string;
      imageUrl?: string | null;
      acceptedAnswers: string[];
    };

export type CsvImportError = {
  row: number;
  errors: string[];
};

export async function getQuestions(qbId: string): Promise<QuestionRecord[]> {
  const response = await api.get<QuestionRecord[]>(`/api/banks/${qbId}/questions`);
  return response.data;
}

export async function createQuestion(payload: QuestionPayload): Promise<QuestionRecord> {
  const response = await api.post<QuestionRecord>(`/api/banks/${payload.qbId}/questions`, payload);
  return response.data;
}

export async function updateQuestion(
  questionId: string,
  payload: QuestionPayload
): Promise<QuestionRecord> {
  const response = await api.put<QuestionRecord>(`/api/questions/${questionId}`, payload);
  return response.data;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await api.delete(`/api/questions/${questionId}`);
}

export async function importQuestionsCsv(formData: FormData): Promise<{ imported: number }> {
  const response = await api.post<{ imported: number }>("/api/questions/import-csv", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data;
}

export async function importQuestionsMoodleHtml(formData: FormData): Promise<{ imported: number, warnings: string[] }> {
  const response = await api.post<{ imported: number, warnings: string[] }>("/api/questions/import-moodle-html", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data;
}

export async function importQuestionsDocx(formData: FormData): Promise<{ imported: number, warnings: string[] }> {
  const response = await api.post<{ imported: number, warnings: string[] }>("/api/questions/import-docx", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data;
}

export async function uploadQuestionImage(formData: FormData): Promise<{ imageUrl: string }> {
  const response = await api.post<{ imageUrl: string }>("/api/questions/upload-image", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });

  return response.data;
}

export async function deduplicateQuestions(qbId: string): Promise<{ deleted: number }> {
  const response = await api.post<{ deleted: number }>("/api/questions/deduplicate", { qbId });
  return response.data;
}

export type DocxPreviewItem = {
  tempId: string;
  num: string;
  questionText: string;
  textLines: string[];
  options: Record<string, string>;
  answerLetter: string;
  hasEquation: boolean;
  suggestedType: "MCQ_TEXT" | "MCQ_IMAGE";
};

export type DocxPreviewResponse = {
  success: boolean;
  totalQuestions: number;
  pureTextCount: number;
  equationCount: number;
  questions: DocxPreviewItem[];
};

export async function analyzeDocxFile(qbId: string, file: File): Promise<DocxPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<DocxPreviewResponse>(`/api/banks/${qbId}/docx-preview`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function commitDocxImport(
  qbId: string,
  questions: Array<DocxPreviewItem & { importType: "MCQ_TEXT" | "MCQ_IMAGE" }>
): Promise<{ success: boolean; importedCount: number; message: string }> {
  const response = await api.post<{ success: boolean; importedCount: number; message: string }>(
    `/api/banks/${qbId}/docx-commit`,
    { questions }
  );
  return response.data;
}

export type BulkSavePayload = {
  creates: QuestionPayload[];
  updates: Array<QuestionPayload & { id: string }>;
  deletes: string[];
};

export async function bulkSaveQuestions(qbId: string, payload: BulkSavePayload): Promise<void> {
  await api.post(`/api/banks/${qbId}/questions/bulk`, payload);
}
