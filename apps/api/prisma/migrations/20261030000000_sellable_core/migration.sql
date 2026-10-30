-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "audience" JSONB,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "failed_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "message_body" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "sent_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "template_id" UUID;

-- AlterTable
ALTER TABLE "follow_ups" ADD COLUMN     "appointment_id" UUID,
ADD COLUMN     "last_reminded_at" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reminder_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "service_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "appointment_id" UUID,
ADD COLUMN     "payment_link_url" TEXT,
ADD COLUMN     "stripe_checkout_session_id" TEXT,
ADD COLUMN     "void_reason" TEXT;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "queue_entries" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "room" TEXT;

-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "converted_patient_id" UUID,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "referred_name" TEXT,
ADD COLUMN     "referred_phone" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nps_score" INTEGER,
ADD COLUMN     "request_id" UUID,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "source_id" UUID,
ADD COLUMN     "source_type" TEXT;

-- AlterTable
ALTER TABLE "templates" ADD COLUMN     "external_template_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "purpose" TEXT;

-- AlterTable
ALTER TABLE "workflow_templates" ADD COLUMN     "steps" JSONB,
ADD COLUMN     "trigger" TEXT;

-- CreateTable
CREATE TABLE "doctor_leaves" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID,
    "appointment_id" UUID,
    "token" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_leaves_organization_id_doctor_id_start_date_idx" ON "doctor_leaves"("organization_id", "doctor_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_token_key" ON "review_requests"("token");

-- CreateIndex
CREATE INDEX "review_requests_organization_id_branch_id_idx" ON "review_requests"("organization_id", "branch_id");

-- CreateIndex
CREATE INDEX "review_requests_patient_id_idx" ON "review_requests"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_checkout_session_id_key" ON "invoices"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_request_id_key" ON "reviews"("request_id");

-- AddForeignKey
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

