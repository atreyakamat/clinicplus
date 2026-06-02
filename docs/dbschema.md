# ClinicOS Database Schema Master Blueprint

## Version 1.0

### Foundation Database Architecture (F001–F030)

---

# DOCUMENT PURPOSE

This document defines the core PostgreSQL schema architecture for ClinicOS.

This schema is designed to support:

* Single Clinics
* Multi-Clinic Organizations
* Telemedicine
* AI Systems
* Marketplace Integrations
* ABDM/ABHA Integrations
* Enterprise Healthcare Networks

This document acts as the source of truth for:

* Backend Development
* API Development
* Frontend Development
* Reporting
* Analytics
* AI Infrastructure

---

# DATABASE DESIGN PRINCIPLES

## Principle 1: Multi-Tenant First

Every business record must belong to:

organization_id

branch_id

No exceptions.

---

## Principle 2: UUID Everywhere

All primary keys use UUID.

Example:

org_8f8a2c

usr_9ad233

pt_11ac88

appt_92bc77

---

## Principle 3: Soft Delete

Every critical table contains:

deleted_at

deleted_by

delete_reason

---

## Principle 4: Auditability

Every table contains:

created_at

updated_at

created_by

updated_by

---

## Principle 5: Patient-Centric Design

Everything ultimately connects to:

Patient

Because Patient is the central healthcare entity.

---

# DOMAIN 01

# ORGANIZATION DOMAIN

## organizations

Stores healthcare organizations.

Columns

id

name

legal_name

slug

logo_url

website

email

phone

subscription_plan

subscription_status

status

created_at

updated_at

---

## branches

Stores clinic locations.

Columns

id

organization_id

name

code

address

city

state

country

postal_code

phone

email

timezone

status

created_at

updated_at

---

## departments

Stores clinical departments.

Columns

id

organization_id

branch_id

name

description

status

created_at

updated_at

---

# DOMAIN 02

# AUTHENTICATION DOMAIN

## users

Stores platform users.

Columns

id

organization_id

branch_id

first_name

last_name

email

phone

avatar_url

password_hash

last_login_at

status

created_at

updated_at

---

## roles

Columns

id

organization_id

name

description

created_at

updated_at

---

## permissions

Columns

id

module

action

description

---

## role_permissions

Columns

id

role_id

permission_id

---

## user_roles

Columns

id

user_id

role_id

---

## user_sessions

Columns

id

user_id

device_name

ip_address

login_at

logout_at

status

---

# DOMAIN 03

# PATIENT CRM DOMAIN

## patients

Master patient table.

Columns

id

organization_id

branch_id

patient_code

first_name

middle_name

last_name

gender

date_of_birth

phone

email

blood_group

marital_status

occupation

abha_number

status

created_at

updated_at

---

## patient_addresses

Columns

id

patient_id

address_type

address_line_1

address_line_2

city

state

country

postal_code

---

## patient_emergency_contacts

Columns

id

patient_id

name

relationship

phone

email

---

## patient_family_members

Columns

id

patient_id

related_patient_id

relationship

---

## patient_tags

Columns

id

patient_id

tag_name

tag_color

---

## patient_notes

Columns

id

patient_id

created_by

note

created_at

---

# DOMAIN 04

# APPOINTMENT DOMAIN

## appointments

Columns

id

organization_id

branch_id

patient_id

doctor_id

appointment_type

appointment_source

scheduled_start

scheduled_end

status

notes

created_at

updated_at

---

## doctor_availability

Columns

id

doctor_id

day_of_week

start_time

end_time

slot_duration

---

## appointment_slots

Columns

id

doctor_id

slot_start

slot_end

slot_status

---

## waiting_lists

Columns

id

patient_id

doctor_id

preferred_date

status

---

# DOMAIN 05

# QUEUE MANAGEMENT DOMAIN

## queues

Columns

id

branch_id

name

description

---

## queue_entries

Columns

id

queue_id

appointment_id

token_number

check_in_time

called_time

completed_time

status

---

# DOMAIN 06

# CLINICAL DOMAIN

## consultations

Columns

id

patient_id

doctor_id

appointment_id

chief_complaint

history_of_present_illness

clinical_assessment

treatment_plan

consultation_date

---

## diagnoses

Columns

id

consultation_id

icd_code

diagnosis_name

severity

notes

---

## vitals

Columns

id

consultation_id

height

weight

temperature

pulse

respiratory_rate

blood_pressure_systolic

blood_pressure_diastolic

spo2

---

## allergies

Columns

id

patient_id

allergy_name

severity

notes

---

## medical_conditions

Columns

id

patient_id

condition_name

diagnosed_date

status

---

# DOMAIN 07

# PRESCRIPTION DOMAIN

## prescriptions

Columns

id

patient_id

doctor_id

consultation_id

issued_at

---

## prescription_items

Columns

id

prescription_id

medicine_name

dosage

frequency

duration

instructions

---

# DOMAIN 08

# MEDICAL DOCUMENTS DOMAIN

## medical_documents

Columns

id

patient_id

uploaded_by

document_type

title

file_url

mime_type

file_size

uploaded_at

---

## lab_reports

Columns

id

patient_id

consultation_id

document_id

report_date

status

---

## imaging_reports

Columns

id

patient_id

consultation_id

document_id

report_date

---

# DOMAIN 09

# FOLLOW-UP DOMAIN

## follow_ups

Columns

id

patient_id

doctor_id

consultation_id

scheduled_date

status

notes

---

## follow_up_outcomes

Columns

id

follow_up_id

outcome_type

remarks

recorded_at

---

# DOMAIN 10

# BILLING DOMAIN

## invoices

Columns

id

patient_id

invoice_number

subtotal

discount

tax

total

status

created_at

---

## invoice_items

Columns

id

invoice_id

item_name

quantity

unit_price

amount

---

## payments

Columns

id

invoice_id

amount

payment_method

transaction_reference

payment_status

paid_at

---

## refunds

Columns

id

payment_id

amount

reason

status

processed_at

---

# DOMAIN 11

# COMMUNICATION DOMAIN

## messages

Columns

id

patient_id

channel

direction

message_body

delivery_status

sent_at

---

## templates

Columns

id

organization_id

name

channel

template_content

---

## campaigns

Columns

id

organization_id

name

channel

status

started_at

ended_at

---

# DOMAIN 12

# REVIEWS & REFERRALS DOMAIN

## reviews

Columns

id

patient_id

doctor_id

rating

review_text

created_at

---

## referrals

Columns

id

patient_id

source

campaign_name

status

created_at

---

# DOMAIN 13

# ANALYTICS DOMAIN

## analytics_events

Columns

id

event_name

entity_type

entity_id

payload

created_at

---

## doctor_metrics

Columns

id

doctor_id

metric_name

metric_value

recorded_at

---

## dashboard_snapshots

Columns

id

dashboard_type

snapshot_json

generated_at

---

# DOMAIN 14

# TASKS & OPERATIONS DOMAIN

## tasks

Columns

id

organization_id

branch_id

title

description

assigned_to

patient_id

priority

status

due_date

created_at

---

## task_comments

Columns

id

task_id

user_id

comment

created_at

---

## workflow_templates

Columns

id

organization_id

name

description

status

---

# MVP TABLE COUNT

Foundation Layer:
12 Tables

Patient Layer:
8 Tables

Appointment Layer:
5 Tables

Clinical Layer:
8 Tables

Billing Layer:
4 Tables

Communication Layer:
3 Tables

Analytics Layer:
3 Tables

Operations Layer:
3 Tables

Total MVP Tables:
46+

---

# MVP MODULE COVERAGE

Supports:

F001–F018

F020

F029

F030

This schema is sufficient to launch ClinicOS, onboard clinics, generate revenue, collect feedback, and scale toward future modules such as AI, Telemedicine, Marketplace, ABHA, and Enterprise Networks.

END OF DATABASE SCHEMA MASTER BLUEPRINT V1.0
