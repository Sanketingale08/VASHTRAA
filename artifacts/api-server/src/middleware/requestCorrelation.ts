import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = (req.headers["x-request-id"] as string) || `req_${randomUUID()}`;
  (req as any).id = reqId;
  res.setHeader("X-Request-Id", reqId);
  next();
}

