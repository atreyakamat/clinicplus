# ClinicOS Local Development & Setup Guide

## Infrastructure Stack
- **Backend:** NestJS, Prisma, PostgreSQL, Redis
- **Frontend:** React, Vite, TailwindCSS
- **Package Manager:** pnpm

## 1. Initial Setup
1.  **Clone the Repo:** `git clone <repo-url>`
2.  **Install Dependencies:** `pnpm install`
3.  **Environment Variables:** Create `.env` in `apps/api` and `apps/web`.
    -   `DATABASE_URL="postgresql://user:pass@localhost:5432/clinicos_db?schema=public"`
    -   `JWT_SECRET="your-secret-key"`

## 2. Database Initialization
1.  **Generate Client:** `cd apps/api; npx prisma generate`
2.  **Push Schema:** `npx prisma db push`
3.  **Seed Data:** `npx ts-node prisma/seed.ts` (Generates 1000 patients, 5000 appts)

## 3. Running the Apps
-   **Start API:** `cd apps/api; npm run start:dev`
-   **Start Web:** `cd apps/web; npm run dev`

## 4. Quality Assurance
-   **Run Unit Tests:** `pnpm test`
-   **Run E2E Tests:** `cd apps/api; npm run test:e2e`
-   **Production Build Check:** `pnpm build`

## 5. Deployment (Docker)
1.  `docker-compose build`
2.  `docker-compose up -d`
3.  Access Web at `http://localhost` and API at `http://localhost:3000`
