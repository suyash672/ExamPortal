declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: "TEACHER" | "STUDENT";
      };
    }
  }
}

export {};
