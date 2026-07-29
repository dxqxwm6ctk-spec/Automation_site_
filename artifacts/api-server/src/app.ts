import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { requestLogger } from "./middlewares/requestLogger";
import { notFoundHandler, errorHandler } from "./middlewares/errorHandler";

const app: Express = express();

app.use(requestLogger);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use("/{*splat}", notFoundHandler);
app.use(errorHandler);

export default app;
