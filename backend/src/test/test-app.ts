import express, { type Router } from "express";
import { errorMiddleware } from "../middleware/error.middleware.js";
import { requestIdMiddleware } from "../middleware/request-id.middleware.js";

export function createTestApp(router: Router) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(router);
  app.use(errorMiddleware);
  return app;
}
