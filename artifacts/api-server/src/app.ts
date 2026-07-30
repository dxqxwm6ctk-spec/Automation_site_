import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";
import { requestLogger } from "./middlewares/requestLogger";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler";

const app: Express = express();

app.use(requestLogger);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

app.use("/{*splat}", notFoundHandler);
app.use(errorHandler);

export default app;
