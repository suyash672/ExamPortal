import { randomUUID } from "crypto";
import { PrismaClient, UserType } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";
import { comparePassword, hashPassword } from "../lib/hash";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AuthRole
} from "../lib/jwt";

const prisma = new PrismaClient();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function getRefreshTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === "refreshToken") {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

function getCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  const sameSite: "none" | "lax" = isProduction ? "none" : "lax";

  return {
    httpOnly: true,
    sameSite,
    secure: isProduction,
    maxAge: SEVEN_DAYS_MS
  };
}

function getRoleFilter(role: AuthRole, id: string) {
  return role === "TEACHER"
    ? { userType: UserType.TEACHER, teacherId: id }
    : { userType: UserType.STUDENT, studentId: id };
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? null;
}

const MAX_ACTIVE_REFRESH_TOKENS = 10;

async function pruneStaleRefreshTokens(role: AuthRole, userId: string) {
  try {
    const roleFilter = getRoleFilter(role, userId);

    await prisma.refreshToken.deleteMany({
      where: { ...roleFilter, expiresAt: { lte: new Date() } }
    });

    await prisma.refreshToken.deleteMany({
      where: { ...roleFilter, revokedAt: { lte: new Date() } }
    });

    const surplus = await prisma.refreshToken.findMany({
      where: roleFilter,
      orderBy: { createdAt: "desc" },
      select: { id: true },
      skip: MAX_ACTIVE_REFRESH_TOKENS
    });

    if (surplus.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: { id: { in: surplus.map((token) => token.id) } }
      });
    }
  } catch {
    // Swallow pruning errors so they never break login or refresh.
  }
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, password, role } = req.body as {
      name: string;
      email: string;
      password: string;
      role: AuthRole;
    };
    const passwordHash = await hashPassword(password);

    if (role === "TEACHER") {
      const existingTeacher = await prisma.teacher.findUnique({
        where: { email }
      });

      if (existingTeacher) {
        throw new AppError("Email already in use", 409);
      }

      await prisma.teacher.create({
        data: {
          name,
          email,
          passwordHash
        }
      });
    } else {
      const existingStudent = await prisma.student.findUnique({
        where: { email }
      });

      if (existingStudent) {
        throw new AppError("Email already in use", 409);
      }

      await prisma.student.create({
        data: {
          name,
          email,
          passwordHash
        }
      });
    }

    res.status(201).json({ message: "Account created" });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, role } = req.body as {
      email: string;
      password: string;
      role: AuthRole;
    };

    const user =
      role === "TEACHER"
        ? await prisma.teacher.findUnique({ where: { email } })
        : await prisma.student.findUnique({ where: { email } });

    if (!user) {
      throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError("Invalid credentials", 401);
    }

    const sessionId = randomUUID();
    const payload = { id: user.id, role, sessionId };
    const accessToken = signAccessToken({ id: user.id, role });
    const refreshToken = signRefreshToken(payload);

    await pruneStaleRefreshTokens(role, user.id);

    await prisma.refreshToken.create({
      data: {
        tokenHash: await hashPassword(refreshToken),
        sessionId,
        userAgent: req.headers["user-agent"] ?? null,
        ipAddress: getClientIp(req),
        lastUsedAt: new Date(),
        userType: role,
        teacherId: role === "TEACHER" ? user.id : null,
        studentId: role === "STUDENT" ? user.id : null,
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS)
      }
    });

    res.cookie("refreshToken", refreshToken, getCookieOptions());

    res.status(200).json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = getRefreshTokenFromCookie(req);

    if (!rawToken) {
      throw new AppError("Unauthorized", 401);
    }

    let decoded: { id: string; role: AuthRole; sessionId: string };

    try {
      decoded = verifyRefreshToken(rawToken);
    } catch {
      throw new AppError("Unauthorized", 401);
    }

    // Look up session by sessionId (O(1) instead of bcrypt-comparing all tokens).
    // NOTE: revokedAt is intentionally NOT in the where clause. Prisma's MongoDB
    // connector has a known bug where a `{ revokedAt: null }` equality filter,
    // when combined with other conditions, fails to match documents whose field
    // genuinely is null. We therefore fetch by sessionId and check revocation +
    // expiry in application code below.
    const existingToken = await prisma.refreshToken.findFirst({
      where: {
        sessionId: decoded.sessionId,
        ...getRoleFilter(decoded.role, decoded.id)
      }
    });

    const isActive =
      existingToken !== null &&
      existingToken.revokedAt === null &&
      existingToken.expiresAt.getTime() > Date.now();

    if (!existingToken || !isActive) {
      throw new AppError("Unauthorized", 401);
    }

    const user =
      decoded.role === "TEACHER"
        ? await prisma.teacher.findUnique({
          where: { id: decoded.id },
          select: { id: true, name: true, email: true }
        })
        : await prisma.student.findUnique({
          where: { id: decoded.id },
          select: { id: true, name: true, email: true }
        });

    // Update session activity and extend expiry (sliding sessions)
    const newExpiresAt = new Date(Date.now() + SEVEN_DAYS_MS);
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { lastUsedAt: new Date(), expiresAt: newExpiresAt }
    });

    // Re-issue the same cookie to extend the browser's cookie TTL
    res.cookie("refreshToken", rawToken, getCookieOptions());

    const newAccessToken = signAccessToken({ id: decoded.id, role: decoded.role });

    res.status(200).json({
      accessToken: newAccessToken,
      user: user
        ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: decoded.role
        }
        : null
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = getRefreshTokenFromCookie(req);

    if (rawToken) {
      try {
        const decoded = verifyRefreshToken(rawToken);
        await prisma.refreshToken.updateMany({
          where: {
            sessionId: decoded.sessionId,
            ...getRoleFilter(decoded.role, decoded.id)
          },
          data: { revokedAt: new Date() }
        });
      } catch {
        // Clear cookie regardless of token validity.
      }
    }

    const { httpOnly, sameSite, secure } = getCookieOptions();
    res.clearCookie("refreshToken", {
      httpOnly,
      sameSite,
      secure
    });

    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
}
