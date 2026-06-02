# ClinicOS Master Data Architecture (MDA)

## Version 1.0

Document Type: System Architecture Blueprint

Purpose:
Define the foundational data architecture, ownership model, entity relationships, tenancy model, governance rules, and scaling strategy for the entire ClinicOS ecosystem.

Status: Foundational Architecture

Applies To:

* F001 → F030
* Web Application
* Mobile Application
* AI Platform
* Telemedicine Platform
* Marketplace Platform
* Enterprise Platform
* ABDM Integration Layer

---

# SECTION 1

# ARCHITECTURAL PRINCIPLES

ClinicOS is not a clinic application.

ClinicOS is a healthcare operating system.

Every architectural decision must support:

* Single Clinic
* Multi-Clinic Groups
* Healthcare Networks
* Franchise Chains
* Telemedicine
* Marketplace Services
* National Health Stack Integrations
* AI Systems

from Day One.

---

# SECTION 2

# CORE ARCHITECTURE PHILOSOPHY

Everything in ClinicOS belongs to a hierarchy.

Organization

↓

Branch

↓

Department

↓

User

↓

Patient

↓

Clinical Activity

↓

Business Activity

↓

Analytics

---

Nothing should exist without ownership.

---

# SECTION 3

# TENANCY MODEL

Model

Multi-Tenant SaaS

Architecture

Organization-Based Isolation

Structure

Organization

↓

Branch

↓

Department

↓

User

---

Example

Solara Healthcare

Organization

↓

Mapusa Clinic

Branch

↓

General Medicine

Department

↓

Doctor

User

---

Rule

Every major entity contains:

organization_id

branch_id

---

Mandatory.

---

# SECTION 4

# UNIVERSAL ENTITY RULES

Every table should include:

id

created_at

updated_at

deleted_at

created_by

updated_by

organization_id

branch_id

---

Purpose

Auditability

Ownership

Scalability

Soft Deletes

Compliance

---

# SECTION 5

# IDENTIFIER STRATEGY

Primary Keys

UUID

Example

usr_3fa92f

pt_1ab772

appt_9fd421

inv_8fd233

---

Never use incremental IDs.

---

# SECTION 6

# DOMAIN ARCHITECTURE

ClinicOS consists of 15 primary domains.

Identity

Organization

Patient

Appointments

Clinical

Documents

Follow-Ups

Revenue

Communication

Growth

Analytics

AI

Telemedicine

Marketplace

Government

Operations

---

Each domain owns specific data.

---

# SECTION 7

# IDENTITY DOMAIN

Purpose

Authentication and authorization.

Entities

Users

Roles

Permissions

Sessions

Audit Logs

Devices

Login History

API Tokens

---

Ownership

Platform Domain

---

Relationships

User

↓

Role

↓

Permissions

---

# SECTION 8

# ORGANIZATION DOMAIN

Purpose

Represent healthcare organizations.

Entities

Organizations

Branches

Departments

Teams

Staff Profiles

Locations

Working Hours

Policies

---

Relationships

Organization

↓

Branch

↓

Department

↓

User

---

# SECTION 9

# PATIENT DOMAIN

Purpose

Patient ownership and identity.

Entities

Patients

Patient Profiles

Family Members

Emergency Contacts

Insurance Profiles

ABHA Profiles

Patient Preferences

Patient Tags

Patient Notes

---

Relationships

Patient

↓

Appointments

↓

Consultations

↓

Invoices

↓

Messages

↓

Documents

---

Patient becomes central entity.

---

# SECTION 10

# PATIENT TIMELINE MODEL

Every patient action creates timeline events.

Examples

Registered

Appointment Booked

Consultation Completed

Prescription Generated

Invoice Paid

Follow-Up Created

Review Submitted

Telemedicine Session

---

Single chronological history.

---

# SECTION 11

# APPOINTMENT DOMAIN

Entities

Appointments

Appointment Slots

Doctor Availability

Schedules

Queues

Queue Entries

Waiting Lists

Appointment Types

---

Relationships

Doctor

↓

Availability

↓

Appointment

↓

Queue Entry

---

# SECTION 12

# CLINICAL DOMAIN

Entities

Consultations

Diagnoses

Clinical Notes

Treatment Plans

Prescriptions

Vitals

Symptoms

Allergies

Medical Conditions

Clinical Outcomes

---

Relationships

Patient

↓

Consultation

↓

Diagnosis

↓

Prescription

↓

Outcome

---

Core healthcare engine.

---

# SECTION 13

# DOCUMENT DOMAIN

Entities

Medical Documents

Reports

Images

Certificates

Insurance Documents

Scans

Attachments

---

Storage

Object Storage

Not Database Storage.

---

Database stores metadata only.

---

# SECTION 14

# FOLLOW-UP DOMAIN

Entities

Follow-Ups

Reminders

Outcomes

Recovery Status

Care Plans

Follow-Up Tasks

---

Relationships

Consultation

↓

Follow-Up

↓

Reminder

↓

Outcome

---

# SECTION 15

# REVENUE DOMAIN

Entities

Invoices

Invoice Items

Payments

Refunds

Packages

Subscriptions

Outstanding Balances

Financial Events

---

Relationships

Patient

↓

Invoice

↓

Payment

↓

Receipt

---

# SECTION 16

# COMMUNICATION DOMAIN

Entities

Messages

Campaigns

Templates

Communication Preferences

Delivery Logs

WhatsApp Events

Email Events

SMS Events

---

Event-driven architecture.

---

# SECTION 17

# GROWTH DOMAIN

Entities

Reviews

Feedback

NPS Scores

Referrals

Referral Sources

Campaign Results

---

Tracks clinic growth.

---

# SECTION 18

# ANALYTICS DOMAIN

Entities

Metrics

Reports

Dashboard Snapshots

Benchmarks

Forecasts

Analytics Events

---

Read-only intelligence layer.

---

# SECTION 19

# AI DOMAIN

Entities

AI Insights

Predictions

Summaries

Recommendations

Tasks

Embeddings

Knowledge Chunks

Model Logs

---

Supports future AI expansion.

---

# SECTION 20

# TELEMEDICINE DOMAIN

Entities

Sessions

Participants

Session Notes

Recordings

Session Files

Virtual Prescriptions

---

Integrated with Clinical Domain.

---

# SECTION 21

# MARKETPLACE DOMAIN

Entities

Partners

Services

Bookings

Orders

Claims

Referrals

Partner Reviews

Provider Profiles

---

Supports ecosystem growth.

---

# SECTION 22

# GOVERNMENT DOMAIN

Entities

ABHA Profiles

Consents

Record Shares

Government Sync Logs

Provider Registries

Facility Registries

---

Compliance-first architecture.

---

# SECTION 23

# OPERATIONS DOMAIN

Entities

Tasks

Workflows

Workflow Templates

SOPs

Assignments

Escalations

Operational Events

---

Execution layer.

---

# SECTION 24

# AUDIT ARCHITECTURE

Every major action creates audit entries.

Examples

Patient Updated

Prescription Generated

Invoice Modified

Consent Granted

Task Completed

---

Nothing critical should be untraceable.

---

# SECTION 25

# FILE STORAGE ARCHITECTURE

Storage

AWS S3 / Cloudflare R2

Structure

organization

↓

branch

↓

patient

↓

document

---

Never store files directly inside PostgreSQL.

---

# SECTION 26

# EVENT ARCHITECTURE

Every action generates events.

Examples

appointment_created

consultation_completed

payment_received

followup_created

review_submitted

---

Events feed:

Analytics

AI

Automation

Notifications

---

# SECTION 27

# AI DATA STRATEGY

AI should never query raw tables directly.

AI consumes:

Feature Store

Analytics Warehouse

Patient Summaries

Knowledge Layer

Embeddings

---

Protects performance.

---

# SECTION 28

# SOFT DELETE STRATEGY

Never physically delete critical records.

Use

deleted_at

deleted_by

reason

---

Healthcare data must remain recoverable.

---

# SECTION 29

# SECURITY MODEL

Security Layers

Authentication

Authorization

Audit Logging

Encryption

Consent Management

Rate Limiting

Session Security

---

Defense in depth.

---

# SECTION 30

# MASTER ENTITY HIERARCHY

Organization

↓

Branch

↓

Department

↓

User

↓

Patient

↓

Appointment

↓

Consultation

↓

Prescription

↓

Follow-Up

↓

Invoice

↓

Communication

↓

Analytics

---

This hierarchy powers the entire platform.

---

# SECTION 31

# FOUNDER ARCHITECTURE NOTES

Do not build ClinicOS as:

Appointment Software

CRM

Billing Tool

Prescription Tool

Instead build it as:

Healthcare Operating System

Every new feature should connect back into:

Patient

Organization

Clinical Care

Revenue

Analytics

AI

These six pillars should remain stable for years.

Changing them later becomes extremely expensive.

---

# SECTION 32

# MASTER DATA ARCHITECTURE SUMMARY

ClinicOS uses a multi-tenant, organization-first architecture where every entity belongs to an organization and branch, patients act as the central healthcare entity, events power analytics and AI, object storage handles files, UUIDs ensure scalability, audit logs provide traceability, and domain-driven design separates responsibilities across clinical, operational, financial, communication, marketplace, government, and intelligence systems.

This document serves as the foundation for all future database schemas, APIs, services, AI systems, mobile applications, enterprise features, and infrastructure decisions.
