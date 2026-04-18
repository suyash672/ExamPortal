export type UserRole = "TEACHER" | "STUDENT";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};
