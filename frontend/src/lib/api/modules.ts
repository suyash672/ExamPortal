import api from "../axios";

export type ModuleRecord = {
  id: string;
  subjectId: string;
  name: string;
  createdAt: string;
  _count?: {
    questionBanks: number;
  };
};

export type ModulePayload = {
  name: string;
};

export async function getModules(subjectId: string): Promise<ModuleRecord[]> {
  const response = await api.get<ModuleRecord[]>(`/api/subjects/${subjectId}/modules`);
  return response.data;
}

export async function createModule(
  subjectId: string,
  payload: ModulePayload
): Promise<ModuleRecord> {
  const response = await api.post<ModuleRecord>(`/api/subjects/${subjectId}/modules`, payload);
  return response.data;
}

export async function updateModule(
  moduleId: string,
  payload: ModulePayload
): Promise<ModuleRecord> {
  const response = await api.put<ModuleRecord>(`/api/modules/${moduleId}`, payload);
  return response.data;
}

export async function deleteModule(moduleId: string): Promise<void> {
  await api.delete(`/api/modules/${moduleId}`);
}
