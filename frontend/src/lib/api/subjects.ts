import api from "../axios";

export type SubjectRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: {
    modules: number;
  };
};

export type SubjectPayload = {
  name: string;
  description?: string;
};

export async function getSubjects(): Promise<SubjectRecord[]> {
  const response = await api.get<SubjectRecord[]>("/api/subjects");
  return response.data;
}

export async function createSubject(payload: SubjectPayload): Promise<SubjectRecord> {
  const response = await api.post<SubjectRecord>("/api/subjects", payload);
  return response.data;
}

export async function updateSubject(
  subjectId: string,
  payload: Partial<SubjectPayload>
): Promise<SubjectRecord> {
  const response = await api.put<SubjectRecord>(`/api/subjects/${subjectId}`, payload);
  return response.data;
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await api.delete(`/api/subjects/${subjectId}`);
}
