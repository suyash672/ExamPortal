import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthRole = "TEACHER" | "STUDENT";

export type AuthTokenPayload = {
  id: string;
  role: AuthRole;
};

export type RefreshTokenPayload = {
  id: string;
  role: AuthRole;
  sessionId: string;
};

function getEnvOrThrow(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function parseAccessPayload(decoded: string | JwtPayload): AuthTokenPayload {
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const id = decoded.id;
  const role = decoded.role;

  if (
    typeof id !== "string" ||
    (role !== "TEACHER" && role !== "STUDENT")
  ) {
    throw new Error("Invalid token payload");
  }

  return { id, role };
}

function parseRefreshPayload(decoded: string | JwtPayload): RefreshTokenPayload {
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const id = decoded.id;
  const role = decoded.role;
  const sessionId = decoded.sessionId;

  if (
    typeof id !== "string" ||
    (role !== "TEACHER" && role !== "STUDENT") ||
    typeof sessionId !== "string"
  ) {
    throw new Error("Invalid token payload");
  }

  return { id, role, sessionId };
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getEnvOrThrow("JWT_SECRET"), { expiresIn: "15m" });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getEnvOrThrow("JWT_REFRESH_SECRET"), {
    expiresIn: "7d"
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, getEnvOrThrow("JWT_SECRET"));
  return parseAccessPayload(decoded);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, getEnvOrThrow("JWT_REFRESH_SECRET"));
  return parseRefreshPayload(decoded);
}
