-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancellation_reason" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "medical_documents" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "storage_key" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "reminder_key" TEXT;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "communication_opt_in" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preferred_channel" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "appointments_doctor_id_scheduled_start_idx" ON "appointments"("doctor_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "appointments_organization_id_branch_id_scheduled_start_idx" ON "appointments"("organization_id", "branch_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_date_idx" ON "follow_ups"("scheduled_date");

-- CreateIndex
CREATE INDEX "follow_ups_patient_id_idx" ON "follow_ups"("patient_id");

-- CreateIndex
CREATE INDEX "login_attempts_email_attempt_time_idx" ON "login_attempts"("email", "attempt_time");

-- CreateIndex
CREATE INDEX "medical_documents_patient_id_idx" ON "medical_documents"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_reminder_key_key" ON "messages"("reminder_key");

-- CreateIndex
CREATE INDEX "messages_patient_id_idx" ON "messages"("patient_id");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "patients_organization_id_phone_idx" ON "patients"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "patients_organization_id_last_name_first_name_idx" ON "patients"("organization_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_patient_code_key" ON "patients"("organization_id", "patient_code");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_idempotency_key_key" ON "payments"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "queue_entries_appointment_id_idx" ON "queue_entries"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_queue_id_token_number_key" ON "queue_entries"("queue_id", "token_number");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

