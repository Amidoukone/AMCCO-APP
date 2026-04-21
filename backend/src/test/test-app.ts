import express, { type Router } from "express";
import { errorMiddleware } from "../middleware/error.middleware.js";

export function createTestApp(router: Router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorMiddleware);
  return app;
}
