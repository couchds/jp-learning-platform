import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      details: error.details
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      details: error.flatten()
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: "Internal server error"
  });
}

export function parseLimitOffset(query: Request["query"]) {
  const rawLimit = Number.parseInt(String(query.limit ?? "50"), 10) || 50;
  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const offset = Math.max(Number.parseInt(String(query.offset ?? "0"), 10) || 0, 0);
  return { limit, offset };
}
