# ClinicOS Disaster Recovery & Backup Plan

## 1. Data Backup Strategy
### 1.1 Database (PostgreSQL)
- **Primary Tool:** `pg_dump` and Cloud-Native Snapshots (Neon/RDS).
- **Frequency:** Automated every 6 hours.
- **Retention:** 30 days of rolling backups.
- **Storage:** Cross-region replicated storage (AWS S3 or Cloudflare R2).

### 1.2 File Storage (Medical Documents)
- **Strategy:** S3/R2 Versioning enabled.
- **Integrity:** MD5 checksum verification on upload.
- **Redundancy:** Multi-region bucket replication.

## 2. Recovery Procedures (RTO < 4 Hours)
### 2.1 Database Restore
1.  Identify target snapshot from management console.
2.  Provision new temporary database instance.
3.  Execute restore.
4.  Update API `DATABASE_URL` and restart services.

### 2.2 Point-in-Time Recovery
- Neon.tech supports PITR by default. Use the "History" tab in the Neon console to branch the database at a specific timestamp before corruption occurred.

## 3. Business Continuity
- **Status Page:** hosted at `https://status.clinicos.com`.
- **Failover:** API deployed to multiple Railway regions with load balancing.
- **Incident Response:**
  - L1: DevOps alert on Sentry error spike (> 10/min).
  - L2: Principal Engineer engagement if API uptime < 95%.

## 4. Security Incident (Data Breach)
1.  Revoke all active `UserSessions`.
2.  Rotate `JWT_SECRET`.
3.  Notify Organization Owners (Clinic Admins) within 24 hours.
4.  Conduct forensic audit using `AuditLog` records.
