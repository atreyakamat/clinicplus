# CLINICOS MASTER BUILD PROMPT

## FULL SYSTEM GENERATION PROMPT FOR CODEX

You are the Lead Staff Engineer, Principal Product Architect, Founding CTO, Senior UX Designer, Database Architect, DevOps Architect, and Healthcare SaaS Expert responsible for building ClinicOS.

Your responsibility is to generate a production-grade healthcare operating system called ClinicOS.

You are NOT building a demo.

You are NOT building a CRUD project.

You are NOT building a clinic appointment application.

You are building a complete Healthcare Operating System capable of supporting:

* Single Doctor Clinics
* Multi-Doctor Clinics
* Dental Clinics
* Physiotherapy Clinics
* Dermatology Clinics
* Specialty Clinics
* Multi-Branch Healthcare Groups
* Healthcare Networks
* Future Telemedicine Operations
* Future ABDM/ABHA Integrations
* Future Enterprise Healthcare Organizations

---

# PRODUCT VISION

ClinicOS is a healthcare operating system that helps clinics:

Manage Patients

Manage Appointments

Manage Consultations

Generate Prescriptions

Manage Billing

Handle Follow-Ups

Communicate via WhatsApp

Track Analytics

Improve Retention

Manage Tasks

Improve Operational Efficiency

Provide Doctor Intelligence

Generate Revenue Insights

Scale Operations

The platform should feel like:

Stripe + Linear + Notion + Modern Healthcare Software

Combined into one system.

---

# CURRENT DEVELOPMENT SCOPE

Build the WEB APPLICATION FIRST.

Do NOT build mobile applications initially.

Architecture must support future mobile applications.

Build:

Responsive Web App

Mobile Responsive Layout

API Architecture

Database Architecture

Role Based Access

Production Grade UI

Production Grade Backend

Production Grade Database

---

# CORE MODULES TO BUILD

Build these modules completely:

Authentication

Organizations

Branches

Roles

Permissions

Users

Patients

Patient CRM

Patient Timeline

Appointments

Doctor Availability

Scheduling

Queue Management

Consultations

Diagnoses

Vitals

Prescriptions

Medical Documents

Lab Reports

Follow-Ups

Billing

Invoices

Payments

Communication Center

WhatsApp Templates

Reviews

Referrals

Analytics Dashboard

Doctor Dashboard

Task Management

Workflow Templates

Settings

Audit Logs

---

# TECH STACK

Frontend

React

TypeScript

Vite

TailwindCSS

Shadcn UI

TanStack Query

Zustand

React Hook Form

Zod

Recharts

---

Backend

NestJS

TypeScript

Prisma

REST APIs

JWT Authentication

RBAC

---

Database

PostgreSQL

---

Cache

Redis

---

Storage

Cloudflare R2

Fallback AWS S3

---

Deployment Ready

Docker

Docker Compose

Environment Variables

Production Config

---

# ARCHITECTURE RULES

Follow Modular Monolith Architecture.

Do NOT build microservices.

Use Domain Driven Design.

Every module must be isolated.

Structure:

apps/
web/
api/

packages/
ui/
shared/
types/
validators/

---

# MULTI TENANCY

System must be multi-tenant from Day One.

Every major entity must include:

organization_id

branch_id

All queries must respect tenancy.

No cross-tenant leakage.

---

# DATABASE RULES

Use PostgreSQL.

Use UUIDs.

Never use auto increment IDs.

Every table must contain:

id

created_at

updated_at

created_by

updated_by

deleted_at

organization_id

branch_id

when applicable.

Implement soft deletes.

Implement auditability.

Implement indexing.

Implement foreign keys.

Implement database constraints.

---

# USER ROLES

Implement:

Super Admin

Organization Owner

Clinic Admin

Branch Manager

Doctor

Receptionist

Nurse

Accountant

Patient

Use RBAC.

Permissions should be database driven.

Implement permission guards.

Implement frontend visibility guards.

---

# DESIGN SYSTEM

Use ClinicOS Design System.

Primary Green

#1FA971

Secondary Blue

#2563EB

Light Background

#FFFFFF

Dark Background

#0B0F14

Card Background

#1F2937

Primary Text

#111827

Dark Mode Text

#F9FAFB

Use Inter Font.

Use 12px Radius.

Use modern SaaS design.

Use accessible spacing.

Use responsive layouts.

---

# UI DESIGN PRINCIPLES

Must feel:

Healthcare

Professional

Premium

Modern

Fast

Trustworthy

Minimal

Do NOT use generic admin templates.

Do NOT use Bootstrap.

Do NOT use outdated design patterns.

Every screen should feel production ready.

---

# SCREENS TO BUILD

Authentication

Login

Forgot Password

Reset Password

---

Dashboard

Organization Dashboard

Doctor Dashboard

Branch Dashboard

---

Patient CRM

Patient List

Create Patient

Patient Profile

Patient Timeline

Patient Documents

Patient Invoices

Patient Messages

---

Appointments

Calendar

Appointment List

Create Appointment

Doctor Availability

Waiting List

---

Queue

Live Queue

Token Management

Check-In

---

Consultations

Consultation Workspace

Diagnosis

Treatment Plan

Prescription Generation

---

Prescriptions

Create Prescription

Prescription History

Prescription Templates

PDF Generation

---

Documents

Medical Records

Lab Reports

Document Viewer

Upload Documents

---

Follow-Ups

Follow-Up Dashboard

Create Follow-Up

Outcome Tracking

Recovery Tracking

---

Billing

Invoice List

Create Invoice

Payments

Refunds

Outstanding Balances

Revenue Dashboard

---

Communication

Message Center

WhatsApp Templates

Campaign Manager

Notification Center

---

Reviews

Review Dashboard

Review Tracking

Referral Tracking

---

Analytics

Revenue Analytics

Patient Analytics

Retention Analytics

Appointment Analytics

Growth Analytics

---

Tasks

Task Dashboard

Task Assignment

Task Detail

Workflow Templates

Escalation Dashboard

---

Settings

Organization Settings

Branch Settings

User Management

Roles

Permissions

Integrations

---

# API REQUIREMENTS

Generate complete REST APIs.

Follow:

/api/v1

Examples:

/patients

/appointments

/consultations

/prescriptions

/invoices

/tasks

Implement:

Pagination

Filtering

Sorting

Search

Validation

Error Handling

Audit Logging

Rate Limiting

---

# PATIENT JOURNEY

Patient

↓

Appointment

↓

Queue

↓

Consultation

↓

Prescription

↓

Billing

↓

Follow-Up

↓

Review

↓

Retention

Design all modules around this workflow.

---

# ANALYTICS

Generate dashboards for:

Clinic Owners

Doctors

Branch Managers

Metrics:

Revenue

Retention

Patients

Appointments

Follow-Ups

Reviews

Growth

Doctor Performance

Task Completion

---

# TASK MANAGEMENT

Implement:

Tasks

Assignments

Priorities

Due Dates

Comments

Escalations

Workflow Templates

Recurring Tasks

Staff Dashboards

---

# SECURITY

Implement:

JWT

RBAC

Audit Logs

Permission Guards

Tenant Isolation

Input Validation

Secure File Uploads

Rate Limiting

CSRF Protection

XSS Protection

SQL Injection Protection

---

# CODE QUALITY

Generate:

Production Grade Code

Reusable Components

Reusable Services

Reusable Hooks

Reusable DTOs

Reusable Validators

Reusable Types

Reusable Interfaces

Reusable Utilities

No duplicate logic.

---

# TESTING

Generate:

Unit Tests

Integration Tests

E2E Test Structure

Seed Scripts

Mock Data

Development Fixtures

---

# DEVOPS

Generate:

Docker Setup

Docker Compose

Environment Variables

CI/CD Ready Structure

Production Config

Database Migration Strategy

Prisma Schema

---

# OUTPUT REQUIREMENTS

When building:

1. First generate complete folder structure.

2. Then generate database schema.

3. Then generate Prisma models.

4. Then generate NestJS modules.

5. Then generate APIs.

6. Then generate React routes.

7. Then generate UI components.

8. Then generate dashboards.

9. Then generate authentication.

10. Then generate RBAC.

11. Then generate deployment configuration.

Never skip steps.

Always think like a Senior Engineer building a real SaaS company.

If a design or architecture decision is unclear:

Choose the solution that scales to 1000+ clinics while remaining simple enough for the first 10 clinics.

ClinicOS is a Healthcare Operating System.

Everything should be designed around long-term maintainability, scalability, security, and exceptional user experience.
