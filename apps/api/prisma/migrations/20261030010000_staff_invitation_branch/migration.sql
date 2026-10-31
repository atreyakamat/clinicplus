-- Invitations record their target branch in a real column (previously packed
-- into the token as "<sha256>:<branchId>").
ALTER TABLE "staff_invitations" ADD COLUMN "branch_id" UUID;

UPDATE "staff_invitations"
SET "branch_id" = split_part("token", ':', 2)::uuid,
    "token" = split_part("token", ':', 1)
WHERE "token" ~ '^[0-9a-f]{64}:[0-9a-f-]{36}$';
