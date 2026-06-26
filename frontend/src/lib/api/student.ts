import api from "../axios";

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
  attempt: {
    id: string;
    isSubmitted: boolean;
    score: number | null;
    startedAt: string;
    submittedAt: string | null;
    timeRemainingSeconds: number;
  } | null;
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
    qbId: string;
    mcqMode: "single" | "multi";
    mcqOptions: Array<{
      id: string;
      optionText: string;
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
