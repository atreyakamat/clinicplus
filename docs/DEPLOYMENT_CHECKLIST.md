# ClinicOS Production Deployment Checklist

## 1. Environment & Infrastructure
- [ ] DATABASE_URL set to a managed PostgreSQL (e.g., AWS RDS, DigitalOcean Managed DB)
- [ ] REDIS_URL set for caching and queueing
- [ ] JWT_SECRET generated and rotated
- [ ] SSL Certificates (LetsEncrypt) for domain and API
- [ ] Docker Swarm or Kubernetes cluster initialized

## 2. Security & Compliance
- [ ] RBAC verification (Super Admin vs Doctor vs Receptionist)
- [ ] Multi-tenant isolation stress test (Ensuring Org A cannot see Org B data)
- [ ] Database backup strategy (Daily automated snapshots)
- [ ] Audit Logging enabled for all clinical actions (Prescriptions, Billing)
- [ ] Rate limiting enabled on `/api/v1/auth/login`

## 3. Data Integrity
- [ ] Initial Seed data (ICD Codes, Medicine Database) imported
- [ ] Patient import utility tested with real CSV samples
- [ ] Preservation of PII data (Encryption at rest)

## 4. UI/UX Verification
- [ ] White-labeling/Branding: Clinic Logo and Colors verified in header
- [ ] Prescription print layout verified for physical printers
- [ ] Dashboard responsiveness on Tablet (iPads for Doctors)

## 5. Reliability
- [ ] Error boundary logging (Sentry integration)
- [ ] WhatsApp API connection verified with valid Template IDs
- [ ] 99.9% Uptime check configured
