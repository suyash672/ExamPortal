import api from "../axios";

export type QuestionBankRecord = {
  id: string;
  moduleId: string;
  name: string;
  createdAt: string;
  _count: {
    questions: number;
  };
};

export type QuestionBankPayload = {
  name: string;
};

export async function getQuestionBanks(moduleId: string): Promise<QuestionBankRecord[]> {
  const response = await api.get<QuestionBankRecord[]>(`/api/modules/${moduleId}/banks`);
  return response.data;
}

export async function createQuestionBank(
  moduleId: string,
  payload: QuestionBankPayload
): Promise<QuestionBankRecord> {
  const response = await api.post<QuestionBankRecord>(`/api/modules/${moduleId}/banks`, payload);
  return response.data;
}

export async function updateQuestionBank(
  qbId: string,
  payload: QuestionBankPayload
): Promise<QuestionBankRecord> {
  const response = await api.put<QuestionBankRecord>(`/api/banks/${qbId}`, payload);
  return response.data;
}

export async function deleteQuestionBank(qbId: string): Promise<void> {
  await api.delete(`/api/banks/${qbId}`);
}
