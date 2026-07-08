import api from "../axios";

export type TestStatus = "Upcoming" | "Active" | "Ended";

export type TestListItem = {
  id: string;
  teacherId: string;
  title: string;
  enrollmentKey: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalMarks: number;
  isLocked: boolean;
  createdAt: string;
  enrollmentCount: number;
  useFullscreen?: boolean;
  logActivities?: boolean;
  preventCopyPaste?: boolean;
  saveAttempts?: boolean;
  infiniteTries?: boolean;
  resultsReveal?: boolean;
};

export type TestQbRulePayload = {
  qbId: string;
  questionsToPick: number;
  marksPerQuestion: number;
  randomQuestions: boolean;
  randomOrder: boolean;
  uniqueQuestions: boolean;
  shuffleOptions: boolean;
};

export type CreateTestPayload = {
  title: string;
  enrollmentKey: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  qbRules: TestQbRulePayload[];
  useFullscreen?: boolean;
  logActivities?: boolean;
  preventCopyPaste?: boolean;
  saveAttempts?: boolean;
  infiniteTries?: boolean;
  resultsReveal?: boolean;
};

export type CreatedTest = {
  id: string;
  teacherId: string;
  title: string;
  enrollmentKey: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalMarks: number;
  isLocked: boolean;
  createdAt: string;
  useFullscreen?: boolean;
  logActivities?: boolean;
  preventCopyPaste?: boolean;
  saveAttempts?: boolean;
  infiniteTries?: boolean;
  resultsReveal?: boolean;
  testQbRules: Array<{
    id: string;
    testId: string;
    qbId: string;
    questionsToPick: number;
    marksPerQuestion: number;
    randomQuestions: boolean;
    randomOrder: boolean;
    uniqueQuestions: boolean;
    shuffleOptions: boolean;
  }>;
};

export type TestDetails = TestListItem & {
  testQbRules: Array<{
    id: string;
    testId: string;
    qbId: string;
    questionsToPick: number;
    marksPerQuestion: number;
    randomQuestions: boolean;
    randomOrder: boolean;
    uniqueQuestions: boolean;
    shuffleOptions: boolean;
    questionBank: {
      id: string;
      name: string;
      module: {
        id: string;
        name: string;
        subject: {
          id: string;
          name: string;
        };
      };
    };
  }>;
};

export async function getTests(): Promise<TestListItem[]> {
  const response = await api.get<TestListItem[]>("/api/tests");
  return response.data;
}

export async function getTestById(testId: string): Promise<TestDetails> {
  const response = await api.get<TestDetails>(`/api/tests/${testId}`);
  return response.data;
}

export async function createTest(payload: CreateTestPayload): Promise<CreatedTest> {
  const response = await api.post<CreatedTest>("/api/tests", payload);
  return response.data;
}

export async function deleteTest(testId: string): Promise<void> {
  await api.delete(`/api/tests/${testId}`);
}
