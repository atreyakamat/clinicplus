// Loaded before every e2e suite (jest setupFiles). Provides safe test defaults
// without ever overriding an explicitly configured DATABASE_URL.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-not-for-production-0123456789';
process.env.SCHEDULER_ENABLED = 'false';
process.env.BACKUP_SCHEDULE_ENABLED = 'false';
process.env.ACCESS_SYNC_ON_BOOT = 'false';
process.env.MESSAGING_PROVIDER = process.env.MESSAGING_PROVIDER || 'console';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || './storage/test-uploads';
process.env.BACKUP_DIR = process.env.BACKUP_DIR || './storage/test-backups';
process.env.CORS_ORIGINS = 'http://localhost:5173';
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must point at an isolated *_test database to run e2e tests');
}
