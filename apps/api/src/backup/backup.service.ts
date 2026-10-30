import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { join, resolve } from 'path';
import { StorageService } from '../storage/storage.service';

export const BACKUP_FILENAME_RE = /^clinicos-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(-\d{3}Z)?\.sql(\.enc)?$/;
const REMOTE_PREFIX = 'platform/backups/';
const MANIFEST_KEY = `${REMOTE_PREFIX}manifest.json`;
/** Encrypted dump layout: "CPBK1" magic | 12-byte IV | AES-256-GCM ciphertext | 16-byte auth tag. */
const MAGIC = Buffer.from('CPBK1');

export interface BackupEntry {
  name: string;
  size: number;
  date: Date;
  encrypted: boolean;
  local: boolean;
  remote: boolean;
}

interface ManifestEntry {
  name: string;
  size: number;
  date: string;
}

export interface BackupResult {
  name: string;
  path: string;
  size: number;
  encrypted: boolean;
  remote: { uploaded: boolean; key?: string; driver: string; error?: string };
}

/**
 * Platform-level PostgreSQL backups (the whole database, every tenant).
 *
 * - pg_dump into BACKUP_DIR, optionally AES-256-GCM encrypted with BACKUP_ENCRYPTION_KEY.
 * - With STORAGE_DRIVER=s3 the dump is also uploaded to `platform/backups/<file>`
 *   and a manifest object tracks remote copies so retention can prune them.
 * - Retention (BACKUP_RETENTION_DAYS) applies to local files and remote copies.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupDir: string;
  private readonly retentionDays: number;
  private readonly encryptionKey?: Buffer;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.backupDir = resolve(config.get<string>('BACKUP_DIR') ?? './storage/backups');
    this.retentionDays = config.get<number>('BACKUP_RETENTION_DAYS') ?? 14;
    const key = config.get<string>('BACKUP_ENCRYPTION_KEY');
    this.encryptionKey = key ? Buffer.from(key, 'hex') : undefined;
  }

  get remoteEnabled() {
    return this.storage.driverName === 's3';
  }

  private async ensureBackupDirectory() {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  private pgBinary(name: 'pg_dump' | 'psql') {
    const dir = process.env.PG_BIN_DIR;
    return dir ? join(dir, name) : name;
  }

  private connection() {
    const databaseUrl = this.config.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not set');
    const url = new URL(databaseUrl);
    return {
      args: ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), '-d', url.pathname.substring(1)],
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password || '') },
    };
  }

  private run(binary: string, args: string[], env: NodeJS.ProcessEnv) {
    return new Promise<void>((resolvePromise, reject) => {
      execFile(binary, args, { env, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`${binary} failed: ${(stderr || error.message).toString().slice(0, 500)}`));
          return;
        }
        if (stderr) this.logger.warn(`${binary} stderr: ${stderr.toString().slice(0, 500)}`);
        resolvePromise();
      });
    });
  }

  private async encryptFile(src: string, dest: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey!, iv);
    await pipeline(
      createReadStream(src),
      cipher,
      async function* (source: AsyncIterable<Buffer>) {
        yield Buffer.concat([MAGIC, iv]);
        for await (const chunk of source) yield chunk;
        yield cipher.getAuthTag();
      },
      createWriteStream(dest, { mode: 0o600 }),
    );
  }

  private async decryptFile(src: string, dest: string) {
    if (!this.encryptionKey) throw new BadRequestException('BACKUP_ENCRYPTION_KEY is required to restore an encrypted backup');
    const { size } = await fs.stat(src);
    const header = MAGIC.length + 12;
    if (size < header + 16) throw new BadRequestException('Encrypted backup is truncated');
    const fd = await fs.open(src, 'r');
    const head = Buffer.alloc(header);
    const tag = Buffer.alloc(16);
    try {
      await fd.read(head, 0, header, 0);
      await fd.read(tag, 0, 16, size - 16);
    } finally {
      await fd.close();
    }
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new BadRequestException('Not a ClinicPlus encrypted backup');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, head.subarray(MAGIC.length));
    decipher.setAuthTag(tag);
    await pipeline(createReadStream(src, { start: header, end: size - 17 }), decipher, createWriteStream(dest, { mode: 0o600 }));
  }

  /** Creates a dump, encrypts it when a key is configured, mirrors it to S3, then applies retention. */
  async createBackup(): Promise<BackupResult> {
    await this.ensureBackupDirectory();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const plainName = `clinicos-backup-${timestamp}.sql`;
    const plainPath = join(this.backupDir, plainName);
    this.logger.log(`Starting database backup: ${plainName}`);

    const { args, env } = this.connection();
    await this.run(this.pgBinary('pg_dump'), [...args, '-F', 'p', '--no-owner', '-f', plainPath], env);
    await fs.access(plainPath);

    let finalName = plainName;
    let finalPath = plainPath;
    if (this.encryptionKey) {
      finalName = `${plainName}.enc`;
      finalPath = join(this.backupDir, finalName);
      try {
        await this.encryptFile(plainPath, finalPath);
      } finally {
        await fs.unlink(plainPath).catch(() => undefined);
      }
    }
    const { size } = await fs.stat(finalPath);

    const remote: BackupResult['remote'] = { uploaded: false, driver: this.storage.driverName };
    if (this.remoteEnabled) {
      const key = `${REMOTE_PREFIX}${finalName}`;
      try {
        await this.storage.putFile(key, finalPath, 'application/octet-stream');
        const manifest = await this.readManifest();
        manifest.push({ name: finalName, size, date: new Date().toISOString() });
        await this.writeManifest(manifest);
        remote.uploaded = true;
        remote.key = key;
      } catch (err) {
        remote.error = (err as Error).message;
        this.logger.error(`Backup upload to object storage failed: ${remote.error}`);
      }
    }

    await this.cleanupOldBackups();
    this.logger.log(`Backup completed: ${finalName} (${size} bytes, encrypted=${!!this.encryptionKey}, remote=${remote.uploaded})`);
    return { name: finalName, path: finalPath, size, encrypted: !!this.encryptionKey, remote };
  }

  private async readManifest(): Promise<ManifestEntry[]> {
    if (!this.remoteEnabled) return [];
    try {
      if (!(await this.storage.exists(MANIFEST_KEY))) return [];
      const parsed = JSON.parse((await this.storage.getBuffer(MANIFEST_KEY)).toString('utf8'));
      return Array.isArray(parsed) ? parsed.filter((e) => e && BACKUP_FILENAME_RE.test(e.name)) : [];
    } catch (err) {
      this.logger.error(`Could not read backup manifest: ${(err as Error).message}`);
      return [];
    }
  }

  private async writeManifest(entries: ManifestEntry[]) {
    await this.storage.put(MANIFEST_KEY, Buffer.from(JSON.stringify(entries, null, 2)), 'application/json');
  }

  private async localBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      return Promise.all(
        files
          .filter((f) => BACKUP_FILENAME_RE.test(f))
          .map(async (name) => {
            const stats = await fs.stat(join(this.backupDir, name));
            return { name, size: stats.size, date: stats.mtime };
          }),
      );
    } catch (err: any) {
      if (err?.code !== 'ENOENT') this.logger.error(`Failed to list backups: ${err.message}`);
      return [];
    }
  }

  /** Local and remote backups merged by file name, newest first. */
  async listBackups(): Promise<BackupEntry[]> {
    const [local, remote] = await Promise.all([this.localBackups(), this.readManifest()]);
    const byName = new Map<string, BackupEntry>();
    for (const l of local) {
      byName.set(l.name, { ...l, encrypted: l.name.endsWith('.enc'), local: true, remote: false });
    }
    for (const r of remote) {
      const existing = byName.get(r.name);
      if (existing) existing.remote = true;
      else byName.set(r.name, { name: r.name, size: r.size, date: new Date(r.date), encrypted: r.name.endsWith('.enc'), local: false, remote: true });
    }
    return Array.from(byName.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async cleanupOldBackups() {
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    for (const backup of await this.localBackups()) {
      if (backup.date.getTime() >= cutoff) continue;
      await fs.unlink(join(this.backupDir, backup.name)).then(
        () => this.logger.log(`Removed old local backup: ${backup.name}`),
        (err) => this.logger.error(`Failed to remove old backup ${backup.name}: ${err.message}`),
      );
    }
    if (!this.remoteEnabled) return;
    const manifest = await this.readManifest();
    const keep: ManifestEntry[] = [];
    for (const entry of manifest) {
      if (new Date(entry.date).getTime() >= cutoff) {
        keep.push(entry);
        continue;
      }
      try {
        await this.storage.delete(`${REMOTE_PREFIX}${entry.name}`);
        this.logger.log(`Removed old remote backup: ${entry.name}`);
      } catch (err) {
        keep.push(entry);
        this.logger.error(`Failed to remove remote backup ${entry.name}: ${(err as Error).message}`);
      }
    }
    if (keep.length !== manifest.length) await this.writeManifest(keep);
  }

  async getBackupStats() {
    const backups = await this.listBackups();
    return {
      totalBackups: backups.length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0),
      oldestBackup: backups.length ? backups[backups.length - 1].date : null,
      newestBackup: backups.length ? backups[0].date : null,
      retentionDays: this.retentionDays,
      encryption: !!this.encryptionKey,
      storageDriver: this.storage.driverName,
      remoteCopies: backups.filter((b) => b.remote).length,
    };
  }

  private assertName(filename: string) {
    if (!BACKUP_FILENAME_RE.test(filename)) throw new BadRequestException('Invalid backup filename');
  }

  /** Readable stream of a backup (local file, else the remote copy). */
  async openBackup(filename: string): Promise<Readable> {
    this.assertName(filename);
    const local = join(this.backupDir, filename);
    try {
      await fs.access(local);
      return createReadStream(local);
    } catch {
      if (!this.remoteEnabled) throw new NotFoundException('Backup not found');
      return this.storage.getStream(`${REMOTE_PREFIX}${filename}`);
    }
  }

  /** Restores the database from a backup (decrypting / fetching from storage as needed). */
  async restoreBackup(filename: string): Promise<void> {
    this.assertName(filename);
    await this.ensureBackupDirectory();
    const tmpFiles: string[] = [];
    try {
      let source = join(this.backupDir, filename);
      try {
        await fs.access(source);
      } catch {
        if (!this.remoteEnabled) throw new NotFoundException('Backup not found');
        source = join(this.backupDir, `.restore-${Date.now()}-${filename}`);
        tmpFiles.push(source);
        await pipeline(await this.storage.getStream(`${REMOTE_PREFIX}${filename}`), createWriteStream(source, { mode: 0o600 }));
      }
      if (filename.endsWith('.enc')) {
        const plain = join(this.backupDir, `.restore-${Date.now()}.sql`);
        tmpFiles.push(plain);
        await this.decryptFile(source, plain);
        source = plain;
      }
      const { args, env } = this.connection();
      this.logger.warn(`Restoring database from ${filename}`);
      await this.run(this.pgBinary('psql'), [...args, '-v', 'ON_ERROR_STOP=1', '-f', source], env);
      this.logger.log(`Restore completed from ${filename}`);
    } finally {
      await Promise.all(tmpFiles.map((f) => fs.unlink(f).catch(() => undefined)));
    }
  }
}
