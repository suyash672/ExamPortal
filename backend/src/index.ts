import dotenv from "dotenv";
import app from "./app";
import authRouter from "./routes/auth.routes";
import moduleRouter from "./routes/module.routes";
import questionBankRouter from "./routes/questionbank.routes";
import questionRouter from "./routes/question.routes";
import studentRouter from "./routes/student.routes";
import subjectRouter from "./routes/subject.routes";
import testRouter from "./routes/test.routes";

dotenv.config();

app.use(authRouter);
app.use(subjectRouter);
app.use(moduleRouter);
app.use(questionBankRouter);
app.use(questionRouter);
app.use(testRouter);
app.use(studentRouter);

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
