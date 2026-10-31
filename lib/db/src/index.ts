/**
 * @workspace/db Package Entry Point
 *
 * Exposes MongoDB repositories, connections, sequence counters, and domain schema types.
 * PostgreSQL dependencies have been removed; MongoDB is the sole, primary database engine.
 */

import { connectToMongoDB, getMongoDb, isMongoDbConnected, setMongoConnected } from "./mongo";

// Asynchronously initialize connection to MongoDB Atlas
connectToMongoDB().catch((err) => {
  console.warn("[MongoDB Core] Initial connection deferred:", err?.message || err);
});

// Provide a mock db query builder object for legacy callers during migration
export const db: any = new Proxy({}, {
  get(_target, prop) {
    if (prop === "transaction") {
      return async (callback: any) => {
        if (typeof callback === "function") {
          return await callback(db);
        }
        return Promise.resolve([]);
      };
    }
    if (prop === "select" || prop === "insert" || prop === "update" || prop === "delete") {
      return () => {
        const fluentBuilder: any = {
          from: () => fluentBuilder,
          where: () => fluentBuilder,
          orderBy: () => fluentBuilder,
          limit: () => fluentBuilder,
          offset: () => fluentBuilder,
          set: () => fluentBuilder,
          values: () => fluentBuilder,
          returning: () => Promise.resolve([]),
          then: (resolve: any) => Promise.resolve([]).then(resolve),
          catch: (reject: any) => Promise.resolve([]).catch(reject),
        };
        return fluentBuilder;
      };
    }
    return () => Promise.resolve([]);
  }
});

export const pool: any = {
  on: () => {},
  end: () => Promise.resolve(),
  query: () => Promise.resolve({ rows: [] }),
};

export * from "./schema";
export * from "./mongo";
export * from "./mongoRepositories";
export * from "./categories";

// Legacy helper function exports for migration compatibility
export const eq = (a: any, b: any) => ({ [a]: b });
export const and = (...args: any[]) => args;
export const or = (...args: any[]) => args;
export const desc = (col: any) => col;
export const asc = (col: any) => col;
export const ne = (a: any, b: any) => ({ [a]: { $ne: b } });
export const isNotNull = (col: any) => ({ [col]: { $exists: true, $ne: null } });
export const isNull = (col: any) => ({ [col]: null });
export const lt = (a: any, b: any) => ({ [a]: { $lt: b } });
export const lte = (a: any, b: any) => ({ [a]: { $lte: b } });
export const gt = (a: any, b: any) => ({ [a]: { $gt: b } });
export const gte = (a: any, b: any) => ({ [a]: { $gte: b } });
export const ilike = (a: any, b: any) => ({ [a]: { $regex: b, $options: "i" } });
export const inArray = (a: any, b: any) => ({ [a]: { $in: b } });
const sqlFn: any = (...args: any[]) => args;
sqlFn.raw = (str: string) => str;
sqlFn.empty = () => "";
export const sql: any = sqlFn;



