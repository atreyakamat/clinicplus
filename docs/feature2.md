# ClinicOS Feature Specification

Feature ID: F-002

Feature Name: User Registration & Staff Invitation System

Module: Identity & Access System

Priority: P0 (Critical)

Phase: MVP

Status: Planned

Parent Dependency: F-001 Clinic Registration

---

# 1. Feature Overview

After a clinic is created, the clinic owner should be able to invite and manage staff members who will use ClinicOS.

A clinic is not operated by a single person.

A typical clinic may have:

* Owner Doctor
* Additional Doctors
* Receptionists
* Nurses
* Administrators
* Accountants
* Front Desk Staff

This feature allows clinics to build their internal team inside ClinicOS while ensuring that every user only has access to information relevant to their role.

The goal is to make staff onboarding simple, secure, and scalable.

---

# 2. Objective

Allow clinic owners to:

* Add staff members
* Invite users via email
* Invite users via phone number
* Assign roles
* Control permissions
* Activate or deactivate staff accounts

Without requiring technical knowledge.

---

# 3. Problem Statement

Most clinics face staff management issues.

Examples:

Receptionists change frequently.

Doctors join temporarily.

Staff members leave.

Access rights are unclear.

Sensitive patient information may be viewed by unauthorized personnel.

ClinicOS must ensure:

* Easy onboarding
* Secure access
* Proper permission control

---

# 4. Users

Primary Users

Clinic Owner

Clinic Administrator

---

# Secondary Users

Doctor

Receptionist

Nurse

Support Staff

Accountant

---

# 5. Success Criteria

A clinic owner should be able to:

Invite a new staff member

↓

Staff receives invitation

↓

Creates account

↓

Assigned role automatically

↓

Can access dashboard

within 3 minutes.

---

# 6. User Stories

## Clinic Owner

As a clinic owner,

I want to invite my receptionist

so that they can manage appointments.

---

## Doctor

As a doctor,

I want to access patient records

without accessing billing data.

---

## Receptionist

As a receptionist,

I want appointment access

without editing medical records.

---

## Administrator

As an administrator,

I want to manage staff permissions

without contacting ClinicOS support.

---

# 7. User Workflow

Workflow 1

Invite Staff Member

Owner

↓

Staff Page

↓

Click Invite User

↓

Enter Details

↓

Select Role

↓

Send Invitation

↓

Invitation Created

↓

Staff Receives Email

↓

Staff Creates Password

↓

Account Activated

---

Workflow 2

Deactivate Staff

Owner

↓

Staff Management

↓

Select User

↓

Deactivate Account

↓

Access Revoked Immediately

---

Workflow 3

Change User Role

Owner

↓

Select Staff

↓

Edit Role

↓

Save

↓

Permissions Updated

---

# 8. Roles in ClinicOS

## Clinic Owner

Highest clinic-level permissions.

Can:

* Manage clinic
* Manage staff
* View all patients
* View reports
* Manage subscriptions
* Configure settings

Cannot:

* Access other clinics

---

## Administrator

Can:

* Manage operations
* Manage staff
* View reports
* Manage appointments

Cannot:

* Manage subscriptions

---

## Doctor

Can:

* View assigned patients
* Create consultations
* Create prescriptions
* Create follow-ups

Cannot:

* Manage clinic settings
* Manage billing settings

---

## Receptionist

Can:

* Register patients
* Book appointments
* Manage schedules

Cannot:

* Edit consultations
* Access sensitive reports

---

## Nurse

Can:

* Update patient vitals
* Upload reports

Cannot:

* Access billing
* Modify consultations

---

## Accountant

Can:

* Access invoices
* Access payments

Cannot:

* Access clinical records

---

# 9. Permission Framework

ClinicOS uses:

Role-Based Access Control (RBAC)

Every action is protected by permissions.

Examples

Permission:

patients.view

patients.create

patients.edit

patients.delete

appointments.view

appointments.create

appointments.edit

consultations.create

billing.view

billing.edit

reports.view

staff.manage

---

# 10. Data Collected

User Information

Full Name

Email

Phone Number

Role

Department

Designation

Joining Date

Status

Profile Photo

---

# 11. Database Requirements

Table

users

Fields

id

clinic_id

full_name

email

phone

role

department

designation

profile_image

status

created_at

updated_at

---

Table

user_permissions

Fields

id

user_id

permission_key

permission_value

created_at

---

Table

staff_invitations

Fields

id

clinic_id

email

phone

role

token

status

expires_at

created_at

---

# 12. Business Rules

Rule 1

Each user belongs to exactly one clinic.

---

Rule 2

Only Owners and Administrators can invite users.

---

Rule 3

Invitation links expire after 7 days.

---

Rule 4

Email must be unique.

---

Rule 5

Deactivated users cannot login.

---

Rule 6

Owner account cannot be deleted.

---

Rule 7

Every user must have a role.

---

# 13. Invitation System

Invitation Methods

Method 1

Email Invite

Most common.

---

Method 2

Phone Invite

Future Feature

WhatsApp onboarding.

---

Invitation Message

Hello John,

You have been invited to join ClinicOS for ABC Clinic.

Click below to activate your account.

[Activate Account]

---

# 14. Staff Management Screen

Columns

Profile Image

Name

Email

Role

Department

Status

Last Login

Actions

Edit

Deactivate

Delete

Reset Password

---

Filters

Role

Department

Status

Date Joined

---

# 15. Security Requirements

Passwords encrypted.

Invitation tokens encrypted.

Role validation enforced.

Session tracking enabled.

Audit logging mandatory.

Two-factor authentication supported.

---

# 16. Audit Logs

Track:

User Invited

User Activated

Role Changed

User Deactivated

User Deleted

Password Reset

Permission Changed

---

# 17. Notifications

Send notification when:

Invitation Sent

Invitation Accepted

Role Changed

Account Disabled

Password Reset

---

# 18. Edge Cases

Case

Invitation Expired

Action

Generate new invite.

---

Case

Staff enters wrong email.

Action

Owner can resend invite.

---

Case

Receptionist promoted to admin.

Action

Permissions update immediately.

---

Case

Doctor leaves clinic.

Action

Deactivate account while preserving records.

---

Case

User deleted accidentally.

Action

Restore from archive.

---

# 19. Analytics Events

Track

staff_invited

staff_joined

staff_deactivated

role_changed

invitation_expired

staff_deleted

---

# 20. Future Enhancements

Department Hierarchies

Branch-Level Permissions

Custom Roles

Shift Scheduling

Attendance Tracking

Leave Management

Payroll Integration

Biometric Integration

WhatsApp Invitations

Single Sign-On (SSO)

---

# 21. Acceptance Criteria

This feature is complete when:

✓ Owner can invite staff

✓ Staff receives invite

✓ Staff activates account

✓ Role assigned correctly

✓ Permissions enforced

✓ User can login

✓ Owner can deactivate user

✓ Audit logs generated

✓ Staff visible in management dashboard

---

# 22. Feature Summary

The User Registration & Staff Invitation System transforms ClinicOS from a single-user application into a collaborative clinic platform.

It ensures the right people have the right access at the right time while maintaining patient privacy, operational security, and clinic scalability.
