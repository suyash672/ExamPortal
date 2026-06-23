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

function getRefreshTokenFromCookie(req: Request): string | null {
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

async function findMatchingActiveRefreshToken(
  rawToken: string,
  userId: string,
  role: AuthRole
) {
  const whereBase = {
    revokedAt: null as null,
    expiresAt: { gt: new Date() },
    ...getRoleFilter(role, userId)
  };

  const candidates = await prisma.refreshToken.findMany({
    where: whereBase,
    orderBy: { createdAt: "desc" }
  });

  for (const candidate of candidates) {
    const isMatch = await comparePassword(rawToken, candidate.tokenHash);
    if (isMatch) {
      return candidate;
    }
  }

  return null;
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

    const payload = { id: user.id, role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        tokenHash: await hashPassword(refreshToken),
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
    const refreshToken = getRefreshTokenFromCookie(req);

    if (!refreshToken) {
      throw new AppError("Unauthorized", 401);
    }

    let decoded: { id: string; role: AuthRole };

    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError("Unauthorized", 401);
    }

    const existingToken = await findMatchingActiveRefreshToken(
      refreshToken,
      decoded.id,
      decoded.role
    );

    if (!existingToken) {
      throw new AppError("Unauthorized", 401);
    }

    // Token rotation disabled to avoid race conditions with concurrent requests
    // await prisma.refreshToken.update({
    //   where: { id: existingToken.id },
    //   data: { revokedAt: new Date() }
    // });

    const payload = { id: decoded.id, role: decoded.role };
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

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

    await prisma.refreshToken.create({
      data: {
        tokenHash: await hashPassword(newRefreshToken),
        userType: decoded.role,
        teacherId: decoded.role === "TEACHER" ? decoded.id : null,
        studentId: decoded.role === "STUDENT" ? decoded.id : null,
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS)
      }
    });

    res.cookie("refreshToken", newRefreshToken, getCookieOptions());
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
    const refreshToken = getRefreshTokenFromCookie(req);

    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        const existingToken = await findMatchingActiveRefreshToken(
          refreshToken,
          decoded.id,
          decoded.role
        );

        if (existingToken) {
          await prisma.refreshToken.update({
            where: { id: existingToken.id },
            data: { revokedAt: new Date() }
          });
        }
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
