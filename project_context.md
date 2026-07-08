# Project Context: ExamShield Exam Portal

This document provides a comprehensive overview of the **ExamShield** codebase, database schema, architecture, core features, and API routes. It is designed to be fed directly into an LLM to provide full-project context.

---

## 1. Project Overview & Architecture

**ExamShield** is a full-stack, proctored examination portal supporting two distinct user flows:
- **Teachers**: Manage subjects, modules, question banks, and questions. They can build customized tests with flexible rules (e.g. random ordering, question limits, unique questions per candidate), view real-time proctoring activity logs, manually block students, and view/export results.
- **Students**: Register/Login, enroll in exams using unique enrollment keys, take exams under proctored settings (fullscreen enforcement, copy/paste prevention, focus monitoring), and submit answers.

### Core Tech Stack
- **Monorepo Structure**: Separate `/backend` and `/frontend` workspaces.
- **Backend**: Express + TypeScript + Prisma Client (MongoDB database, requires replica set mode for database transactions).
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Axios.
- **Authentication**: JWT access tokens (15-min expiry) paired with HTTP-only refresh tokens (rotation mechanism) and client-side context state (`AuthContext.tsx`).

---

## 2. Directory & File Manifest

Below is the directory structure of the repository (excluding `node_modules`, `.next`, build outputs, and upload directories):

```text
ExamPortal/
├── package.json                   # Root package (monorepo workspaces configuration)
├── README.md                      # Setup and environment variables instructions
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database models (MongoDB schema)
│   ├── src/
│   │   ├── app.ts                 # Express initialization, middlewares (cors, helmet)
│   │   ├── index.ts               # Server entrypoint & mounting route routers
│   │   ├── controllers/           # Route logic handlers
│   │   │   ├── auth.controller.ts
│   │   │   ├── module.controller.ts
│   │   │   ├── question.controller.ts
│   │   │   ├── questionbank.controller.ts
│   │   │   ├── questioncsv.controller.ts     # CSV question parser and import
│   │   │   ├── questiondocx.controller.ts    # Word (.docx) question parser
│   │   │   ├── questionhtml.controller.ts    # Moodle XHTML question parser
│   │   │   ├── results.controller.ts
│   │   │   ├── student.controller.ts
│   │   │   ├── subject.controller.ts
│   │   │   └── test.controller.ts
│   │   ├── lib/                  # Helpers and shared business logic
│   │   │   ├── AppError.ts       # Centralized Error Class
│   │   │   ├── hash.ts           # Argon2/Bcrypt password hashing wrapper
│   │   │   ├── jwt.ts            # Tokens generator and verifier
│   │   │   ├── question.persistence.ts
│   │   │   └── scoring.ts        # Attempt scoring calculations
│   │   ├── middleware/           # Auth, ownership, validation, and error middlewares
│   │   │   ├── auth.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── ownership.ts      # Checks if resource belongs to requesting teacher
│   │   │   └── validate.ts       # Zod-based request body validation middleware
│   │   ├── routes/               # Express routing tables
│   │   │   ├── auth.routes.ts
│   │   │   ├── module.routes.ts
│   │   │   ├── question.routes.ts
│   │   │   ├── questionbank.routes.ts
│   │   │   ├── results.routes.ts
│   │   │   ├── student.routes.ts
│   │   │   ├── subject.routes.ts
│   │   │   └── test.routes.ts
│   │   ├── scripts/
│   │   │   └── import_dsp_resolvable.ts      # Seeding script parsing multiple .docx questions
│   │   ├── types/
│   │   │   └── express.d.ts      # Custom Express req typings
│   │   └── validators/           # Zod schemas for inputs
│   └── tsconfig.json
├── frontend/
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── middleware.ts         # Matchers config for route protection
│   │   ├── app/                  # Next.js App Router folders
│   │   │   ├── layout.tsx        # Base styling, Providers
│   │   │   ├── page.tsx          # Landing / portal dispatching page
│   │   │   ├── (auth)/           # Authentication layout and route pages
│   │   │   ├── (student)/        # Student pages (available tests & exam workspace)
│   │   │   └── (teacher)/        # Teacher dashboard, test configs, modules
│   │   ├── components/           # Reusable elements
│   │   │   ├── teacher/          # Modal, Drawer & Form builders
│   │   │   └── ui/               # Confirmation boxes, Toasts, Loaders
│   │   ├── context/              # AuthContext and ToastContext
│   │   ├── lib/
│   │   │   ├── api/              # API Client fetch hooks (subjects, tests, student, etc.)
│   │   │   ├── apiError.ts       # Centralized API error parsing
│   │   │   ├── axios.ts          # Axios wrapper injecting JWT header credentials
│   │   │   └── types.ts          # Front-end shared typescript typings
│   │   └── tsconfig.json
```

---

## 3. Database Schema (Prisma & MongoDB)

The database schema is defined in [schema.prisma](file:///c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/backend/prisma/schema.prisma):

- **Users**: 
  - `Teacher`: Unique email, password hash, and relationship relations to created `Subject` and `Test` records.
  - `Student`: Unique email, password hash, and relations to exam `Enrollment` list.
  - `RefreshToken`: Maps a hashed refresh token to a session/device/user (`Student` or `Teacher`). Supports token revocation.
- **Hierarchy Structure**:
  - `Subject` (1-to-N with `Module`)
  - `Module` (1-to-N with `QuestionBank`)
  - `QuestionBank` (1-to-N with `Question`). Has a generic `type` indicator (e.g., `"easy"`, `"hard"`, `"complex"`).
- **Questions**:
  - `Question`: Belonging to a bank. Can be `MCQ` (Multiple Choice) or `TEXT` (Free-text answers).
  - `McqOption`: Associated option texts and a grading weight `scorePercent` (e.g. `100` for the right answer, or splits for multi-select, and `0` for wrong choices).
  - `TextAcceptedAnswer`: Set of acceptable answers (for text validation).
- **Tests & Rules**:
  - `Test`: Has a duration, timestamps, locked status, proctoring configuration (`useFullscreen`, `logActivities`, `preventCopyPaste`), and a list of `TestQbRule` criteria.
  - `TestQbRule`: Details how many questions (`questionsToPick`) to pull from a particular `QuestionBank`, details scoring metrics (`marksPerQuestion`), and configures randomization behavior (`randomQuestions`, `randomOrder`, `uniqueQuestions` across attempts, and `shuffleOptions`).
- **Attempts**:
  - `Enrollment`: Many-to-many relationship mapping `Student` to `Test` (uniquely keyed), housing a single `Attempt`.
  - `Attempt`: Stores timestamps, score, submission state, a status flag `isBlocked` (for proctor blocking), a list of dynamically selected `AttemptQuestion` records, and an embedded array `activities` of proctoring events (`AttemptActivity[]`).
  - `AttemptQuestion`: Represents the instance of a question loaded in this student's attempt, linked to an optional `AttemptAnswer`.
  - `AttemptAnswer`: Stores `textAnswer` (if `TEXT` question), score received (`marksAwarded`), and multiple `AttemptAnswerOption` (for MCQ choices).

---

## 4. Key Systems & Workflows

### A. Proctoring System
The proctoring system is configured on a per-test level (via `Test` fields) and enforced in the student’s workspace page ([page.tsx](file:///c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/frontend/src/app/(student)/tests/[attemptId]/page.tsx)):
1. **Fullscreen Locking**: If `useFullscreen` is active, the student is forced to switch into fullscreen mode before beginning. Exiting fullscreen prompts a warn modal and posts a `FULLSCREEN_EXIT` event.
2. **Focus Monitoring**: If `logActivities` is enabled, the frontend registers listener handlers for `visibilitychange` (detecting tab switches or minimized windows) and `blur` (detecting clicking out of the browser window). Violations trigger a warning and log a `FOCUS_LOSS` event.
3. **Copy/Paste Block**: If `preventCopyPaste` is enabled, standard inputs intercept and call `preventDefault` on `copy`, `paste`, `cut`, and `contextmenu` (right click) events. Attempts are captured and logged as `COPY_PASTE_ATTEMPT`.
4. **Activity Logs**: All proctoring events are synced via `POST /api/student/attempt/:attemptId/activity` and pushed directly to the attempt's `activities` array in MongoDB.
5. **Real-time Proctor View / Blocking**: Teachers can view attempts in real-time. If a student exceeds standard thresholds, teachers can set `isBlocked: true` on the Attempt. The student UI periodically polls the attempt state every 5 seconds. If blocked, the workspace locks down immediately and shows a block message.

### B. Question Importing Engines
Teachers can populate `QuestionBanks` in three formats:
1. **CSV Parsing** (`questioncsv.controller.ts`):
   - Uses `csv-parse`. Checks for headers containing type, text, options (e.g. `option_1_text`, `option_1_score`) or `accepted_answer_X`.
   - Validates each row using Zod (`createQuestionSchema`). Valid rows are committed in a transaction.
2. **MS Word (.docx) Parsing** (`questiondocx.controller.ts` & `import_dsp_resolvable.ts`):
   - Opens the `.docx` zip container to parse `word/document.xml` using `cheerio`.
   - Extracts plain paragraph texts while handling rich math symbols. It translates XML nodes like sub/sup, superscript/subscript, and `m:oMath` inline formula nodes into standardized HTML syntax (`<sub>`, `<sup>`, `<b>`, `<i>`).
   - Identifies MCQ structures using regex expressions matching numbering (e.g. `1. `, `A) ` or `A. `, `Answer: A`).
3. **Moodle XHTML Parsing** (`questionhtml.controller.ts`):
   - Parses XHTML code via cheerio selectors (`.question`, `.questiontext`, `ul.multichoice li`).
   - Registers choices and defaults the first choice to 100% (the instructor can refine weights post-import).

### C. Test Generation Logic
When a student triggers `beginTest`, the backend performs dynamic construction:
- Iterates over each `TestQbRule` defined for the test.
- Fetches all active questions in the designated `QuestionBank`.
- If `uniqueQuestions` is enabled, it filters out questions already assigned to other student attempts for this same test, attempting to distribute distinct questions.
- Applies shuffling or order preservation:
  - If `randomQuestions`, it shuffles the list and picks the requested amount.
  - If `randomOrder`, it shuffles the final picked questions. Otherwise, it orders them according to their original database sequence.
- Inserts `AttemptQuestion` records into the database.

### D. Scoring Engine
Evaluations are automated via `scoring.ts`:
- **MCQ Scoring**:
  - Validates selections.
  - If the student selects *any* option that has a `scorePercent` of `0` (wrong answer), the question receives a score of **0** (preventing random guessing in multi-select).
  - Otherwise, the score percents of all selected options are added, divided by 100, scaled by the rule’s `marksPerQuestion`, and truncated using `Math.floor`.
- **Text Scoring**:
  - Standardizes the student’s text (trimming surrounding whitespace, converting to lowercase).
  - Compares it with the database's `acceptedAnswers` list.
  - Matches receive 100% of the rule’s `marksPerQuestion`.

---

## 5. API Routes Map

All Express API endpoints are mounted on `/api/*` and handled inside [index.ts](file:///c:/Users/Onkar/Desktop/Work@SPTBI/ExamPortal/backend/src/index.ts):

| Method | Endpoint | Description | Middleware & Validations |
|---|---|---|---|
| **POST** | `/api/auth/register` | Create a new Teacher or Student | `auth.validators` |
| **POST** | `/api/auth/login` | Authenticate user and issue JWT cookie | `auth.validators` |
| **POST** | `/api/auth/refresh` | Rotate and issue a fresh Access Token | HTTP-only cookie check |
| **POST** | `/api/auth/logout` | Revoke session and clear cookies | Auth check |
| **GET** | `/api/subjects` | Get subjects created by the teacher | `requireRole("TEACHER")` |
| **POST** | `/api/subjects` | Create a subject | `requireRole("TEACHER")` |
| **GET** | `/api/subjects/:subjectId/modules` | List modules within a subject | `requireRole("TEACHER")` |
| **POST** | `/api/subjects/:subjectId/modules` | Add a module to a subject | Ownership checks |
| **GET** | `/api/modules/:moduleId/banks` | List question banks in a module | `requireRole("TEACHER")` |
| **POST** | `/api/modules/:moduleId/banks` | Create a question bank | Ownership checks |
| **GET** | `/api/banks/:qbId/questions` | List questions in a question bank | `requireRole("TEACHER")` |
| **POST** | `/api/banks/:qbId/questions` | Add single question manually | `requireRole("TEACHER")` |
| **POST** | `/api/questions/import-csv` | Import questions from CSV buffer | File size + MIME validations |
| **POST** | `/api/questions/import-docx` | Import questions from DOCX buffer | Word XML custom parser |
| **POST** | `/api/questions/import-html` | Import questions from Moodle HTML | Cheerio XHTML selectors |
| **GET** | `/api/tests` | List tests created by the teacher | `requireRole("TEACHER")` |
| **POST** | `/api/tests` | Create a test configured with rules | `test.validators` |
| **GET** | `/api/tests/:id` | Get test configuration & rules | `requireRole("TEACHER")` |
| **GET** | `/api/tests/:testId/results` | List all student scores & violations | `requireRole("TEACHER")` |
| **GET** | `/api/tests/:testId/results/export` | Download exam attempt logs in CSV format | `requireRole("TEACHER")` |
| **GET** | `/api/student/tests` | List available tests for students | `requireRole("STUDENT")` |
| **POST** | `/api/student/enroll` | Enroll in a test using an enrollment key | Key checks |
| **POST** | `/api/student/begin` | Create attempt and construct questions | `requireRole("STUDENT")` |
| **GET** | `/api/student/attempt/:attemptId` | Load active attempt questions | Auto-submit evaluation on expiry |
| **POST** | `/api/student/answer` | Save current question answer during test | `saveAnswerSchema` Zod validation |
| **POST** | `/api/student/submit` | Submit test attempt early | Runs `scoring.ts` evaluation |
| **POST** | `/api/student/attempt/:attemptId/activity` | Post proctoring warning/activity event | Activity validation |
