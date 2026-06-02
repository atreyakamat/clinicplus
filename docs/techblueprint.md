# ClinicOS Technical Blueprint v1.0

## Purpose

This document converts the ClinicOS Master Product Blueprint into a buildable technical architecture.

Audience:

* Founder
* Product Manager
* UI/UX Designer
* Frontend Developer
* Backend Developer
* Future Team Members

This blueprint should be detailed enough that a developer can begin implementation immediately.

---

# 1. Architecture Overview

ClinicOS will be built as a SaaS platform.

Architecture Style:

Multi-Tenant SaaS

Meaning:

One application serves multiple clinics.

Every clinic has its own isolated data.

Example:

Clinic A cannot see Clinic B data.

All tables will be scoped using:

clinic_id

---

# 2. Recommended Technology Stack

## Frontend

Framework

* Next.js 15
* React
* TypeScript

UI

* ShadCN UI
* TailwindCSS
* Framer Motion

State Management

* Zustand

Forms

* React Hook Form
* Zod

Tables

* TanStack Table

Charts

* Recharts

---

## Backend

Backend Platform

* Supabase

Services Used

* Authentication
* PostgreSQL
* Storage
* Edge Functions
* Realtime

---

## Hosting

Frontend

* Vercel

Backend

* Supabase Cloud

---

## Future Integrations

* WhatsApp Cloud API
* Razorpay
* Twilio
* SendGrid
* Google Calendar
* Google Meet

---

# 3. Multi-Tenant Architecture

Every record belongs to a clinic.

Example:

Patients

| id | clinic_id | name |

Appointments

| id | clinic_id | patient_id |

Consultations

| id | clinic_id | appointment_id |

---

Rule:

Every query must include clinic_id.

Example:

SELECT * FROM patients
WHERE clinic_id = current_clinic

---

# 4. User Roles

## Super Admin

ClinicOS Team

Can access:

* All clinics
* Subscription management
* Platform analytics

---

## Clinic Owner

Can access:

* Entire clinic
* Billing
* Staff
* Reports

---

## Doctor

Can access:

* Patients
* Consultations
* Follow-Ups

Cannot:

* Manage subscriptions

---

## Receptionist

Can access:

* Patients
* Appointments

Cannot:

* Modify consultation records

---

## Patient (Future)

Can access:

* Own records
* Own appointments

---

# 5. Database Schema

## Clinics

Stores clinic information.

Fields

* id
* name
* logo_url
* phone
* email
* address
* city
* state
* country
* timezone
* subscription_plan
* created_at

---

## Users

Stores authenticated users.

Fields

* id
* clinic_id
* full_name
* email
* role
* phone
* is_active
* created_at

---

## Doctors

Fields

* id
* clinic_id
* user_id
* specialization
* qualification
* registration_number
* bio
* consultation_fee

---

## Patients

Fields

* id
* clinic_id
* patient_code
* first_name
* last_name
* gender
* dob
* phone
* email
* blood_group
* address
* emergency_contact_name
* emergency_contact_phone
* notes

---

## Patient Medical Profile

Fields

* id
* patient_id
* allergies
* chronic_conditions
* medications
* surgeries
* family_history

---

## Family Relationships

Fields

* id
* clinic_id
* primary_patient_id
* linked_patient_id
* relationship

Example

Father
Mother
Child
Sibling

---

## Appointments

Fields

* id
* clinic_id
* patient_id
* doctor_id
* appointment_date
* appointment_time
* duration
* status
* notes

Status

* Scheduled
* Confirmed
* Checked In
* In Progress
* Completed
* Cancelled
* No Show

---

## Consultations

Fields

* id
* clinic_id
* patient_id
* doctor_id
* appointment_id
* symptoms
* diagnosis
* treatment_plan
* prescription_notes
* follow_up_required
* follow_up_date

---

## Documents

Fields

* id
* clinic_id
* patient_id
* consultation_id
* file_url
* file_type
* uploaded_by

Types

* Prescription
* Lab Report
* Scan
* Image

---

## Follow Ups

Fields

* id
* clinic_id
* patient_id
* consultation_id
* follow_up_date
* status
* notes

Status

* Pending
* Completed
* Missed

---

## Notifications

Fields

* id
* clinic_id
* patient_id
* channel
* message
* delivery_status
* sent_at

---

## Billing

Fields

* id
* clinic_id
* patient_id
* consultation_id
* amount
* payment_status
* payment_method
* invoice_number

---

## Audit Logs

Fields

* id
* clinic_id
* user_id
* action
* entity_type
* entity_id
* timestamp

---

# 6. Application Structure

/app

/auth

/dashboard

/patients

/patients/[id]

/appointments

/consultations

/followups

/documents

/reports

/settings

/billing

/staff

---

# 7. Main Navigation

Sidebar

Dashboard

Patients

Appointments

Consultations

Follow-Ups

Documents

Reports

Billing

Staff

Settings

---

# 8. Screen Architecture

## Dashboard

Widgets

* Appointments Today
* New Patients
* Follow-Ups Due
* Revenue
* No Shows
* Returning Patients

---

## Patients Page

Features

* Search
* Filter
* Add Patient
* Export

Columns

* Name
* Phone
* Age
* Last Visit
* Next Follow-Up

---

## Patient Profile

Tabs

Overview

Timeline

Appointments

Consultations

Documents

Billing

Family

Notes

---

## Appointment Calendar

Views

* Day
* Week
* Month

Actions

* Create
* Edit
* Cancel

---

## Consultation Page

Doctor View

Patient Summary

Symptoms

Diagnosis

Prescription

Documents

Follow-Up

Save Consultation

---

## Follow-Up Dashboard

Views

Pending

Completed

Missed

Overdue

---

## Reports Page

Patient Reports

Appointment Reports

Revenue Reports

Follow-Up Reports

Retention Reports

---

# 9. Patient Timeline Engine

Every activity generates an event.

Examples

Patient Registered

Appointment Booked

Consultation Completed

Prescription Uploaded

Follow-Up Created

Payment Completed

Events are displayed chronologically.

---

# 10. Automation Engine

Rule Based System

Trigger

Appointment Tomorrow

Action

Send Reminder

---

Trigger

Patient Missed Appointment

Action

Send Recovery Message

---

Trigger

Patient Inactive 180 Days

Action

Add To Re-Engagement Campaign

---

# 11. Patient Lifecycle Engine

Stages

Lead

↓

Registered

↓

Consulted

↓

Treatment Active

↓

Follow-Up Due

↓

Recovered

↓

Revisit Due

↓

Inactive

Lifecycle updates automatically.

---

# 12. Analytics Engine

Metrics

Patient Retention

Patient Churn

Revenue

Doctor Performance

No Show Rate

Follow-Up Completion

Average Visits Per Patient

Patient Lifetime Value

---

# 13. API Structure

Authentication

POST /auth/login

POST /auth/register

---

Patients

GET /patients

POST /patients

PUT /patients/:id

DELETE /patients/:id

---

Appointments

GET /appointments

POST /appointments

PUT /appointments/:id

DELETE /appointments/:id

---

Consultations

GET /consultations

POST /consultations

PUT /consultations/:id

---

Follow-Ups

GET /followups

POST /followups

PUT /followups/:id

---

Documents

POST /documents

GET /documents

DELETE /documents/:id

---

Reports

GET /reports/revenue

GET /reports/patients

GET /reports/retention

---

# 14. Phase 2 Integration Architecture

WhatsApp

Appointment Reminders

Follow-Up Messages

Campaigns

AI Receptionist

---

Razorpay

Online Payments

Invoice Settlement

Subscription Billing

---

Email

Reports

Receipts

Campaigns

---

SMS

Backup Notifications

---

# 15. Security Architecture

Authentication

Supabase Auth

Authorization

Role Based Access Control

Data Protection

Row Level Security

Encryption

HTTPS

Audit Logging

Mandatory

Backups

Daily

---

# 16. MVP Build Order (30 Days)

Week 1

Database

Authentication

Roles

Clinic Setup

---

Week 2

Patient CRM

Patient Profiles

Timeline

---

Week 3

Appointments

Consultations

Documents

---

Week 4

Follow-Ups

Dashboard

Reports

Deployment

Beta Launch

---

# 17. Future Architecture

Patient Mobile App

AI Assistant

WhatsApp CRM

Lab Integrations

Pharmacy Integrations

Insurance Integrations

Telemedicine

Multi-Branch Management

Hospital Management

Enterprise Reporting

---

# Final Engineering Goal

ClinicOS should become the central healthcare operating system where every patient interaction, clinic operation, follow-up, communication, payment, document, report, and healthcare workflow is managed through a single platform.
