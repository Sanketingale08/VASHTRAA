import { Request, Response, NextFunction } from "express";
import { LoggerService } from "../services/loggerService";

export function centralErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.status || err.statusCode || 500;
  const requestId = (req as any).id || "req_unknown";
  const user = (req as any).user;

  LoggerService.logApp("error", `API Error: ${err.message || "Unknown error"}`, {
    requestId,
    actor: user ? { id: user.id || user._id, role: user.role } : undefined,
    error: err,
    metadata: {
      route: req.originalUrl || req.url,
      method: req.method,
      statusCode,
    },
  });

  res.status(statusCode).json({
    error: statusCode === 500 ? "An unexpected server error occurred. Please contact support." : err.message,
    code: err.code || "INTERNAL_ERROR",
    requestId,
    timestamp: new Date().toISOString(),
  });
}

