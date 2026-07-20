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
  isLocked?: boolean;
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

export async function releaseTestResults(testId: string): Promise<void> {
  await api.post(`/api/tests/${testId}/release-results`);
}

export type ModuleStatItem = {
  moduleId: string;
  moduleName: string;
  subjectName: string;
  questionsPicked: number;
  totalMarks: number;
  averageScore: number;
  accuracyPercent: number;
};

export type BankStatItem = {
  qbId: string;
  qbName: string;
  difficulty: string;
  moduleName: string;
  questionsPicked: number;
  marksPerQuestion: number;
  totalMarks: number;
  averageScore: number;
  accuracyPercent: number;
};

export type TestStatistics = {
  totalEnrollments: number;
  attemptedCount: number;
  attemptingCount: number;
  notAttemptedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  totalMarks: number;
  moduleStats?: ModuleStatItem[];
  bankStats?: BankStatItem[];
};

export type UpdateTestSettingsPayload = {
  title?: string;
  enrollmentKey?: string | null;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  isLocked?: boolean;
  useFullscreen?: boolean;
  logActivities?: boolean;
  preventCopyPaste?: boolean;
  saveAttempts?: boolean;
  infiniteTries?: boolean;
  resultsReveal?: boolean;
};

export async function getTestStatistics(testId: string): Promise<TestStatistics> {
  const response = await api.get<TestStatistics>(`/api/tests/${testId}/statistics`);
  return response.data;
}

export async function updateTestSettings(
  testId: string,
  payload: UpdateTestSettingsPayload
): Promise<TestListItem> {
  const response = await api.patch<TestListItem>(`/api/tests/${testId}/settings`, payload);
  return response.data;
}
