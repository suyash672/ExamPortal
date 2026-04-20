import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    res.status(422).json({ error: "Validation failed", issues: error.flatten() });
    return;
  }

  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? ((error as { statusCode: number }).statusCode)
      : null;

  const zodFromWrappedError =
    typeof error === "object" &&
    error !== null &&
    "zodError" in error &&
    (error as { zodError?: unknown }).zodError instanceof ZodError
      ? ((error as { zodError: ZodError }).zodError)
      : null;

  if (statusCode !== null) {
    if (zodFromWrappedError) {
      res
        .status(422)
        .json({ error: "Validation failed", issues: zodFromWrappedError.flatten() });
      return;
    }

    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Request failed";

    res.status(statusCode).json({ error: message });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}
