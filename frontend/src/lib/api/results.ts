import api from "../axios";

export type TestResultItem = {
  studentName: string;
  studentEmail: string;
  score: number | null;
  totalMarks: number;
  isSubmitted: boolean;
  isBlocked: boolean;
  submittedAt: string | null;
  attemptId: string;
  activities?: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
};

export type AttemptDetail = {
  id: string;
  testId: string;
  testTitle: string;
  enrollmentId: string;
  isSubmitted: boolean;
  isBlocked: boolean;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  totalMarks: number;
  student: {
    id: string;
    name: string;
    email: string;
  };
  activities?: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
  questions: Array<{
    attemptQuestionId: string;
    question: {
      id: string;
      text: string;
      type: "MCQ" | "TEXT";
      mcqOptions: Array<{
        id: string;
        optionText: string;
        isCorrect: boolean;
      }>;
      acceptedAnswers: string[];
    };
    studentAnswer: {
      textAnswer: string | null;
      selectedOptionIds: string[];
    } | null;
    marksAwarded: number | null;
    maxMarks: number | null;
  }>;
};

export async function getTestResults(testId: string): Promise<TestResultItem[]> {
  const response = await api.get<TestResultItem[]>(`/api/tests/${testId}/results`);
  return response.data;
}

export async function getAttemptDetail(
  testId: string,
  attemptId: string
): Promise<AttemptDetail> {
  const response = await api.get<AttemptDetail>(`/api/tests/${testId}/attempts/${attemptId}`);
  return response.data;
}

export async function downloadResultsCsv(testId: string): Promise<void> {
  const response = await api.get<Blob>(`/api/tests/${testId}/results/export`, {
    responseType: "blob"
  });

  const blob = new Blob([response.data], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `results-${testId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function blockStudentAttempt(
  testId: string,
  attemptId: string,
  isBlocked: boolean
): Promise<void> {
  await api.post(`/api/tests/${testId}/attempts/${attemptId}/block`, { isBlocked });
}
