# ClinicOS Frontend Screen Inventory & UX Architecture

## Version 1.0

Document Type: Frontend Blueprint

Purpose:
Define every major screen, page, dashboard, modal, workflow, and navigation structure required for ClinicOS.

Applies To:

* Admin Portal
* Doctor Portal
* Reception Portal
* Manager Portal
* Patient App
* Enterprise Portal

---

# SECTION 1

# NAVIGATION PHILOSOPHY

ClinicOS should be role-first.

Users should only see what they need.

Example:

Doctor should not see accounting screens.

Receptionist should not see AI analytics.

Patient should not see clinic operations.

---

# SECTION 2

# PRIMARY USER TYPES

1. Super Admin
2. Organization Owner
3. Clinic Admin
4. Doctor
5. Receptionist
6. Nurse
7. Accountant
8. Operations Manager
9. Patient

---

# SECTION 3

# AUTHENTICATION SCREENS

## AUTH-001

Login

Features

Email Login

Phone Login

Forgot Password

Remember Me

---

## AUTH-002

Forgot Password

---

## AUTH-003

Reset Password

---

## AUTH-004

OTP Verification

---

## AUTH-005

Invite Acceptance

---

# SECTION 4

# GLOBAL DASHBOARD SCREENS

## DASH-001

Organization Dashboard

Displays

Revenue

Patients

Appointments

Doctors

Tasks

Analytics

---

## DASH-002

Branch Dashboard

Displays

Branch Metrics

Queue

Revenue

Staff Performance

---

## DASH-003

Personal Dashboard

Role Specific

---

# SECTION 5

# PATIENT CRM SCREENS

## PAT-001

Patient List

Search

Filters

Export

Pagination

---

## PAT-002

Create Patient

---

## PAT-003

Patient Profile

Tabs

Overview

Appointments

Consultations

Prescriptions

Documents

Invoices

Messages

Tasks

Timeline

---

## PAT-004

Edit Patient

---

## PAT-005

Family Members

---

## PAT-006

Emergency Contacts

---

## PAT-007

Patient Timeline

---

## PAT-008

Patient Tags

---

# SECTION 6

# APPOINTMENT SCREENS

## APP-001

Appointment Calendar

Day View

Week View

Month View

---

## APP-002

Appointment List

---

## APP-003

Create Appointment

---

## APP-004

Reschedule Appointment

---

## APP-005

Appointment Details

---

## APP-006

Doctor Availability

---

## APP-007

Waiting List

---

# SECTION 7

# QUEUE MANAGEMENT SCREENS

## QUEUE-001

Live Queue Dashboard

---

## QUEUE-002

Queue Management

---

## QUEUE-003

Token Display Screen

---

## QUEUE-004

Patient Check-In

---

# SECTION 8

# CONSULTATION SCREENS

## CON-001

Consultation Workspace

Patient Context

Vitals

Diagnosis

Prescription

Notes

---

## CON-002

Consultation History

---

## CON-003

Clinical Notes Editor

---

## CON-004

Diagnosis Management

---

## CON-005

Treatment Plan

---

# SECTION 9

# PRESCRIPTION SCREENS

## RX-001

Create Prescription

---

## RX-002

Prescription Preview

---

## RX-003

Prescription Templates

---

## RX-004

Medication Search

---

## RX-005

Prescription History

---

# SECTION 10

# DOCUMENT MANAGEMENT SCREENS

## DOC-001

Document Vault

---

## DOC-002

Upload Document

---

## DOC-003

Document Viewer

---

## DOC-004

Lab Reports

---

## DOC-005

Imaging Reports

---

# SECTION 11

# FOLLOW-UP SCREENS

## FU-001

Follow-Up Dashboard

---

## FU-002

Create Follow-Up

---

## FU-003

Follow-Up List

---

## FU-004

Follow-Up Outcome

---

## FU-005

Recovery Tracking

---

# SECTION 12

# BILLING SCREENS

## BILL-001

Invoice List

---

## BILL-002

Create Invoice

---

## BILL-003

Invoice Details

---

## BILL-004

Payments

---

## BILL-005

Refunds

---

## BILL-006

Outstanding Payments

---

## BILL-007

Financial Dashboard

---

# SECTION 13

# COMMUNICATION SCREENS

## COM-001

Communication Center

---

## COM-002

WhatsApp Inbox

---

## COM-003

Message Templates

---

## COM-004

Campaign Manager

---

## COM-005

Notification Center

---

# SECTION 14

# REVIEW & REFERRAL SCREENS

## REV-001

Review Dashboard

---

## REV-002

Review List

---

## REV-003

Referral Dashboard

---

## REV-004

Referral Sources

---

# SECTION 15

# ANALYTICS SCREENS

## ANA-001

Clinic Analytics Dashboard

---

## ANA-002

Revenue Analytics

---

## ANA-003

Patient Analytics

---

## ANA-004

Retention Analytics

---

## ANA-005

Appointment Analytics

---

## ANA-006

Communication Analytics

---

# SECTION 16

# DOCTOR INTELLIGENCE SCREENS

## DOCINT-001

Doctor Dashboard

---

## DOCINT-002

Performance Analytics

---

## DOCINT-003

Patient Outcome Analytics

---

## DOCINT-004

Revenue Analytics

---

## DOCINT-005

Doctor Scorecard

---

## DOCINT-006

AI Recommendations

---

# SECTION 17

# TASK MANAGEMENT SCREENS

## TASK-001

My Tasks

---

## TASK-002

All Tasks

---

## TASK-003

Task Detail

---

## TASK-004

Create Task

---

## TASK-005

Workflow Templates

---

## TASK-006

Escalation Dashboard

---

# SECTION 18

# STAFF MANAGEMENT SCREENS

## STAFF-001

Staff Directory

---

## STAFF-002

Create Staff Member

---

## STAFF-003

Staff Profile

---

## STAFF-004

Role Management

---

## STAFF-005

Permission Matrix

---

# SECTION 19

# SETTINGS SCREENS

## SET-001

Organization Settings

---

## SET-002

Branch Settings

---

## SET-003

Billing Settings

---

## SET-004

WhatsApp Settings

---

## SET-005

Notification Settings

---

## SET-006

Integrations

---

# SECTION 20

# PATIENT MOBILE APP SCREENS

## APPM-001

Patient Home

---

## APPM-002

Appointments

---

## APPM-003

Book Appointment

---

## APPM-004

Prescriptions

---

## APPM-005

Medical Records

---

## APPM-006

Reports

---

## APPM-007

Invoices

---

## APPM-008

Notifications

---

## APPM-009

Family Profiles

---

## APPM-010

Profile Settings

---

# SECTION 21

# TELEMEDICINE SCREENS

## TEL-001

Virtual Waiting Room

---

## TEL-002

Video Consultation

---

## TEL-003

Session Summary

---

## TEL-004

Telemedicine Dashboard

---

# SECTION 22

# AI SCREENS

## AI-001

AI Copilot Dashboard

---

## AI-002

AI Recommendations

---

## AI-003

AI Patient Summary

---

## AI-004

AI Revenue Insights

---

# SECTION 23

# ENTERPRISE SCREENS

## ENT-001

Organization Management

---

## ENT-002

Branch Management

---

## ENT-003

Network Dashboard

---

## ENT-004

Regional Dashboard

---

## ENT-005

Compliance Dashboard

---

# SECTION 24

# MVP SCREEN COUNT

Authentication
5

Dashboards
3

Patient CRM
8

Appointments
7

Queue
4

Consultations
5

Prescriptions
5

Documents
5

Follow-Ups
5

Billing
7

Communication
5

Reviews
4

Analytics
6

Doctor Intelligence
6

Tasks
6

Staff
5

Settings
6

Total Web Screens

92+

---

Patient App

10+

---

Telemedicine

4+

---

Enterprise

5+

---

Total Ecosystem Screens

111+

---

# SECTION 25

# FOUNDER NOTES

Not all screens should be designed initially.

Design Priority:

Phase 1

Patient

Appointment

Consultation

Prescription

Billing

Follow-Up

Analytics

Tasks

---

Phase 2

AI

Patient App

Telemedicine

---

Phase 3

Marketplace

Enterprise

ABDM

This document defines the complete UI surface area of ClinicOS and should be used as the master reference for design, frontend development, navigation architecture, and future feature planning.
