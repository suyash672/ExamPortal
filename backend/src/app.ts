import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(helmet());
app.use(express.json());

app.get("/health", (_req, res) => {
  return res.json({ status: "ok" });
});

export default app;
