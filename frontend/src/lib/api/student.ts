import api from "../axios";

import type { AttemptDetail } from "./results";

export type StudentTestSummary = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalMarks: number;
  enrolled: boolean;
  enrollmentId: string | null;
  hasEnrollmentKey: boolean;
  resultsReveal: boolean;
  infiniteTries: boolean;
  saveAttempts: boolean;
  attempts: Array<{
    id: string;
    isSubmitted: boolean;
    score: number | null;
    startedAt: string;
    submittedAt: string | null;
    timeRemainingSeconds: number;
  }>;
};

export type EnrollPayload = {
  testId: string;
  enrollmentKey: string;
};

export type BeginTestPayload = {
  enrollmentId: string;
};

export type BeginTestQuestion = {
  id: string;
  attemptId: string;
  questionId: string;
  question: {
    id: string;
    type: "MCQ" | "TEXT";
    questionText: string;
    imageUrl?: string | null;
    qbId: string;
    mcqMode: "single" | "multi";
    mcqOptions: Array<{
      id: string;
      optionText: string;
      imageUrl?: string | null;
    }>;
  };
  answer: {
    id: string;
    textAnswer: string | null;
    selectedOptionIds: string[];
  } | null;
};

export type AttemptPayload = {
  id: string;
  enrollmentId: string;
  testTitle: string;
  startedAt: string;
  submittedAt: string | null;
  isSubmitted: boolean;
  score: number | null;
  totalMarks: number;
  timeRemainingSeconds: number;
  useFullscreen?: boolean;
  logActivities?: boolean;
  preventCopyPaste?: boolean;
  isBlocked?: boolean;
  attemptQuestions: BeginTestQuestion[];
};

export type SaveAnswerPayload = {
  attemptId: string;
  attemptQuestionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
};

export type SubmitAttemptPayload = {
  attemptId: string;
};

export type SubmitAttemptResponse = {
  score: number;
  totalMarks: number;
};

export async function getStudentTests(): Promise<StudentTestSummary[]> {
  const response = await api.get<StudentTestSummary[]>("/api/student/tests");
  return response.data;
}

export async function enrollInTest(payload: EnrollPayload): Promise<void> {
  await api.post("/api/student/enroll", payload);
}

export async function beginTest(payload: BeginTestPayload): Promise<AttemptPayload> {
  const response = await api.post<AttemptPayload>("/api/student/begin", payload);
  return response.data;
}

export async function getAttempt(attemptId: string): Promise<AttemptPayload> {
  const response = await api.get<AttemptPayload>(`/api/student/attempt/${attemptId}`);
  return response.data;
}

export async function saveAnswer(payload: SaveAnswerPayload): Promise<void> {
  await api.post("/api/student/answer", payload);
}

export async function submitAttempt(
  payload: SubmitAttemptPayload
): Promise<SubmitAttemptResponse> {
  const response = await api.post<SubmitAttemptResponse>("/api/student/submit", payload);
  return response.data;
}

export async function logAttemptActivity(
  attemptId: string,
  payload: { type: string; message: string }
): Promise<void> {
  await api.post(`/api/student/attempt/${attemptId}/activity`, payload);
}

export async function getStudentAttemptReview(attemptId: string): Promise<AttemptDetail> {
  const response = await api.get<AttemptDetail>(`/api/student/attempt/${attemptId}/review`);
  return response.data;
}

export async function submitTestPreview(
  testId: string,
  answers: Record<string, { selectedOptionIds: string[]; textAnswer: string }>
): Promise<{ score: number; totalMarks: number }> {
  const response = await api.post<{ score: number; totalMarks: number }>(
    `/api/student/attempt/preview-${testId}/submit`,
    { answers }
  );
  return response.data;
}
