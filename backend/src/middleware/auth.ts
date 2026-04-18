import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AuthRole } from "../lib/jwt";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = authorization.slice(7).trim();

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
}

export function requireRole(role: AuthRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.user.role !== role) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}
