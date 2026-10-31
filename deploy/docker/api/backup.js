#!/usr/bin/env node
/*
 * ClinicPlus database backup job (used by the K8s CronJob; runs in the API image).
 *
 *   node /usr/local/lib/clinicplus/backup.js
 *
 * 1. pg_dump (custom format, compressed) of DATABASE_URL into BACKUP_DIR
 * 2. verifies the archive with `pg_restore --list`
 * 3. optionally uploads it to S3 (BACKUP_S3_BUCKET, or S3_BUCKET when BACKUP_TO_S3=true)
 * 4. deletes local dumps older than BACKUP_RETENTION_DAYS
 * Exits non-zero on any failure so the Job is marked failed (alert on that).
 *
 * Env: DATABASE_URL (required), BACKUP_DIR (/backups), BACKUP_RETENTION_DAYS (14),
 *      BACKUP_S3_BUCKET | BACKUP_TO_S3=true + S3_BUCKET, BACKUP_S3_PREFIX (backups/),
 *      BACKUP_S3_SSE (AES256; empty to disable, e.g. MinIO without KMS),
 *      S3_REGION, S3_ENDPOINT, S3_FORCE_PATH_STYLE, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 * Restore: pg_restore --clean --if-exists --no-owner -d "<url>" clinicplus-<ts>.dump
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const log = (msg) => console.log(`[backup] ${new Date().toISOString()} ${msg}`);

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

function libpqTarget(databaseUrl) {
  // Prisma URLs carry params libpq rejects (schema, connection_limit, ...): strip them and
  // pass the password via PGPASSWORD so it never shows up in the process list.
  const u = new URL(databaseUrl);
  for (const k of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer', 'statement_cache_size', 'socket_timeout', 'connect_timeout']) {
    u.searchParams.delete(k);
  }
  const password = decodeURIComponent(u.password || '');
  u.password = '';
  return { url: u.toString(), password };
}

async function uploadToS3(file, key) {
  const appRequire = createRequire(path.join(process.env.APP_DIR || '/app', 'package.json'));
  const { S3Client, PutObjectCommand } = appRequire('@aws-sdk/client-s3');
  const bool = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
  const client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE),
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined, // fall back to the default provider chain (IRSA / workload identity)
  });
  const bucket = process.env.BACKUP_S3_BUCKET || process.env.S3_BUCKET;
  const sse = process.env.BACKUP_S3_SSE === undefined ? 'AES256' : process.env.BACKUP_S3_SSE;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(file),
      ContentLength: fs.statSync(file).size,
      ContentType: 'application/octet-stream',
      ...(sse ? { ServerSideEncryption: sse } : {}),
    }),
  );
  log(`uploaded s3://${bucket}/${key}`);
}

function prune(dir, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(dir)) {
    if (!/^clinicplus-.*\.dump(\.partial)?$/.test(name)) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).mtimeMs < cutoff) {
      fs.unlinkSync(p);
      log(`pruned ${name}`);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const dir = process.env.BACKUP_DIR || '/backups';
  const retention = Number(process.env.BACKUP_RETENTION_DAYS || 14);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `clinicplus-${stamp}.dump`;
  const file = path.join(dir, name);
  const partial = `${file}.partial`;
  const { url, password } = libpqTarget(process.env.DATABASE_URL);
  const env = { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '15' };

  log(`pg_dump → ${file}`);
  await run('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', '--file', partial, '--dbname', url], env);
  const listing = await run('pg_restore', ['--list', partial], env);
  const entries = listing.split('\n').filter((l) => l && !l.startsWith(';')).length;
  if (entries === 0) throw new Error('backup archive has no entries');
  fs.renameSync(partial, file);
  log(`ok: ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MiB, ${entries} TOC entries`);

  const toS3 = process.env.BACKUP_S3_BUCKET || ['1', 'true', 'yes'].includes(String(process.env.BACKUP_TO_S3 || '').toLowerCase());
  if (toS3) {
    const prefix = (process.env.BACKUP_S3_PREFIX ?? 'backups/').replace(/^\/+/, '');
    await uploadToS3(file, `${prefix}${name}`);
  }
  prune(dir, retention);
  log('done');
}

main().catch((err) => {
  console.error(`[backup] FAILED: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
