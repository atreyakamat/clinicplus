# ClinicOS Role & Permission Matrix (RBAC Blueprint)

## Version 1.0

Document Type: Authorization & Access Control Architecture

Purpose:
Define every role in ClinicOS and determine what each role can View, Create, Edit, Delete, Approve, Export, Assign, and Manage.

Applies To:

* Web Application
* Mobile Application
* Enterprise Platform
* Marketplace Platform
* AI Platform

---

# SECTION 1

# ACCESS CONTROL PHILOSOPHY

Authentication answers:

Who are you?

Authorization answers:

What are you allowed to do?

ClinicOS uses:

Role Based Access Control (RBAC)

with

Permission-Based Overrides

for enterprise flexibility.

---

# SECTION 2

# ACCESS HIERARCHY

Super Admin

↓

Organization Owner

↓

Clinic Admin

↓

Branch Manager

↓

Doctor

↓

Receptionist

↓

Nurse

↓

Accountant

↓

Patient

---

Higher levels inherit lower-level visibility when appropriate.

---

# SECTION 3

# PERMISSION TYPES

VIEW

Read data.

---

CREATE

Create records.

---

EDIT

Modify records.

---

DELETE

Archive records.

---

EXPORT

Export reports/data.

---

APPROVE

Approve actions.

---

ASSIGN

Assign tasks/work.

---

MANAGE

Full administrative access.

---

# SECTION 4

# SUPER ADMIN

Purpose

ClinicOS Platform Administration

Capabilities

Full System Access

All Organizations

All Branches

System Settings

Billing Plans

Feature Flags

Support Tools

Audit Logs

Marketplace

ABDM Configurations

---

Access Level

Unlimited

---

# SECTION 5

# ORGANIZATION OWNER

Purpose

Owns healthcare organization.

Can Access

All Branches

All Staff

All Analytics

All Revenue

All Patients

All Operations

All Reports

All Tasks

All Integrations

---

Cannot Access

Platform-Level Administration

---

# SECTION 6

# CLINIC ADMIN

Purpose

Runs daily clinic operations.

Can Access

Patients

Appointments

Consultations

Billing

Communications

Analytics

Tasks

Staff

Settings

---

Cannot

Manage Subscription Plans

Platform Settings

---

# SECTION 7

# BRANCH MANAGER

Purpose

Manage branch operations.

Can Access

Branch Patients

Branch Revenue

Branch Staff

Branch Analytics

Branch Tasks

Branch Appointments

---

Cannot

Access Other Branches

Organization Settings

---

# SECTION 8

# DOCTOR

Purpose

Clinical Care Provider

Can Access

Assigned Patients

Consultations

Prescriptions

Medical Records

Follow-Ups

Tasks

Doctor Analytics

Telemedicine

---

Cannot

Organization Financials

Staff Management

Subscription Settings

---

# SECTION 9

# RECEPTIONIST

Purpose

Front Desk Operations

Can Access

Patients

Appointments

Queue

Follow-Ups

Messages

Tasks

Basic Billing

---

Cannot

Clinical Notes

Diagnoses

Doctor Revenue Analytics

Advanced Financial Reports

---

# SECTION 10

# NURSE

Purpose

Clinical Support

Can Access

Assigned Patients

Vitals

Follow-Ups

Tasks

Medical Documents

Appointment Information

---

Cannot

Billing

Revenue

Organization Settings

---

# SECTION 11

# ACCOUNTANT

Purpose

Financial Management

Can Access

Invoices

Payments

Refunds

Revenue Reports

Outstanding Balances

Packages

Financial Analytics

---

Cannot

Clinical Notes

Diagnoses

Medical Records

Treatment Plans

---

# SECTION 12

# PATIENT

Purpose

Personal Healthcare Access

Can Access

Own Appointments

Own Prescriptions

Own Reports

Own Payments

Own Follow-Ups

Own Telemedicine Sessions

Own Family Accounts

---

Cannot

Other Patients

Clinic Analytics

Internal Notes

Financial Reports

---

# SECTION 13

# PATIENT MODULE PERMISSIONS

Patients Module

Super Admin

VIEW
CREATE
EDIT
DELETE
EXPORT

---

Organization Owner

VIEW
CREATE
EDIT
DELETE
EXPORT

---

Clinic Admin

VIEW
CREATE
EDIT
DELETE

---

Doctor

VIEW
EDIT

---

Receptionist

VIEW
CREATE
EDIT

---

Nurse

VIEW

---

Accountant

VIEW

---

Patient

VIEW OWN ONLY

---

# SECTION 14

# APPOINTMENT MODULE

Super Admin

Full Access

---

Owner

Full Access

---

Clinic Admin

Full Access

---

Doctor

VIEW

EDIT OWN

---

Receptionist

Full Operational Access

---

Nurse

VIEW

---

Patient

Book

View Own

Reschedule Own

Cancel Own

---

# SECTION 15

# CONSULTATION MODULE

Super Admin

Full Access

---

Owner

View

---

Clinic Admin

View

---

Doctor

Create

Edit

View

---

Receptionist

No Access

---

Nurse

Limited View

---

Patient

View Own Summary Only

---

# SECTION 16

# PRESCRIPTION MODULE

Doctor

Create

Edit

View

---

Receptionist

View Only

---

Patient

View Own

Download Own

---

# SECTION 17

# MEDICAL RECORDS MODULE

Doctor

Full Clinical Access

---

Nurse

Limited Clinical Access

---

Receptionist

Document Upload Only

---

Patient

View Own Records

---

# SECTION 18

# BILLING MODULE

Owner

Full Access

---

Admin

Full Access

---

Accountant

Full Access

---

Receptionist

Create Invoice

Collect Payment

---

Doctor

View Revenue Summary

---

Patient

View Own Invoices

---

# SECTION 19

# COMMUNICATION MODULE

Owner

Full Access

---

Admin

Full Access

---

Doctor

Patient Messaging

---

Receptionist

Messaging Operations

---

Patient

Receive Communications

---

# SECTION 20

# ANALYTICS MODULE

Owner

Full Access

---

Admin

Full Access

---

Branch Manager

Branch Analytics

---

Doctor

Doctor Analytics Only

---

Receptionist

Operational Metrics Only

---

Accountant

Financial Metrics Only

---

# SECTION 21

# TASK MANAGEMENT MODULE

Owner

Full Access

---

Admin

Full Access

---

Manager

Assign Tasks

Monitor Tasks

---

Doctor

Assigned Tasks

Create Tasks

---

Receptionist

Assigned Tasks

---

Nurse

Assigned Tasks

---

# SECTION 22

# STAFF MANAGEMENT MODULE

Owner

Full Access

---

Admin

Full Access

---

Branch Manager

Branch Staff Only

---

Doctor

No Access

---

Receptionist

No Access

---

# SECTION 23

# TELEMEDICINE MODULE

Doctor

Host Sessions

---

Patient

Join Sessions

---

Admin

View Operations

---

Owner

View Analytics

---

# SECTION 24

# AI MODULE

Owner

Full Access

---

Admin

Full Access

---

Doctor

AI Clinical Insights

---

Receptionist

AI Task Suggestions

---

Patient

AI Health Companion

---

# SECTION 25

# ENTERPRISE MODULE

Owner

Full Access

---

Regional Manager

Region Access

---

Branch Manager

Branch Access

---

Other Roles

No Access

---

# SECTION 26

# SENSITIVE DATA RULES

Sensitive Data Includes

Medical History

Diagnoses

Prescriptions

ABHA Information

Consent Records

Financial Information

AI Predictions

---

Additional Permission Checks Required

---

# SECTION 27

# EXPORT RULES

Patient Export

Owner

Admin

---

Financial Export

Owner

Admin

Accountant

---

Medical Export

Doctor

Admin

Patient (Own Data)

---

# SECTION 28

# APPROVAL WORKFLOWS

Invoice Refund

Requires

Accountant + Admin

---

Medical Record Deletion

Requires

Admin Approval

---

ABHA Consent Access

Requires

Patient Consent

---

# SECTION 29

# AUDIT REQUIREMENTS

Every Permission-Sensitive Action Must Log

User

Action

Timestamp

IP

Entity

Before State

After State

---

# SECTION 30

# FUTURE CUSTOM ROLES

Enterprise Clinics Can Create

Custom Roles

Custom Permissions

Custom Access Rules

Custom Branch Restrictions

---

# SECTION 31

# ROLE SUMMARY

Super Admin

Platform Control

---

Organization Owner

Business Control

---

Clinic Admin

Operational Control

---

Branch Manager

Branch Control

---

Doctor

Clinical Control

---

Receptionist

Front Desk Control

---

Nurse

Clinical Support

---

Accountant

Financial Control

---

Patient

Personal Healthcare Access

---

# SECTION 32

# FOUNDER NOTES

RBAC is not a feature.

RBAC is infrastructure.

Most permission systems fail because they are added later.

ClinicOS should implement authorization before building most business logic.

Every API endpoint should be permission-aware from Day One.

This document becomes the source of truth for:

Backend Guards

Frontend Navigation

UI Visibility

API Authorization

Enterprise Security

Compliance

---

# SECTION 33

# MASTER SUMMARY

ClinicOS uses a hierarchical Role-Based Access Control model with permission-level granularity, ensuring that users only access the data and functionality required for their responsibilities while maintaining healthcare privacy, financial security, enterprise scalability, and regulatory compliance across all modules and organizations.
