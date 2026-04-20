import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../lib/AppError";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      const error = new AppError("Validation failed", 422) as AppError & {
        zodError?: unknown;
      };
      error.zodError = parsed.error;
      next(error);
      return;
    }

    req.body = parsed.data;
    next();
  };
}
