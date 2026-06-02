# ClinicOS UI/UX Design System & Component Architecture

## Version 1.0

Document Type: Design System & Product Experience Blueprint

Purpose:
Define the complete visual identity, component system, interaction standards, accessibility rules, layout principles, and design language for ClinicOS.

Applies To:

* Web Application
* Mobile Application
* Patient App
* Admin Portal
* Doctor Portal
* Enterprise Portal

---

# SECTION 1

# DESIGN PHILOSOPHY

ClinicOS should feel:

Professional

Trustworthy

Modern

Medical

Fast

Minimal

Intelligent

Calm

---

When a doctor opens ClinicOS they should feel:

"I am using healthcare infrastructure."

Not:

"I am using a generic CRM."

---

# SECTION 2

# BRAND POSITIONING

Keywords

Healthcare

Trust

Care

Growth

Intelligence

Reliability

Precision

Technology

---

Visual Inspiration

Modern Healthcare

Apple-Level Simplicity

Linear-Level Cleanliness

Notion-Level Clarity

Stripe-Level Professionalism

---

# SECTION 3

# BRAND COLORS

Primary Color

ClinicOS Green

```css
#1FA971
```

Purpose

Growth

Health

Recovery

Trust

---

Secondary Color

ClinicOS Blue

```css
#2563EB
```

Purpose

Technology

Trust

Professionalism

Medical Accuracy

---

Background Color

Pure White

```css
#FFFFFF
```

---

Text Color

Primary

```css
#111827
```

Secondary

```css
#6B7280
```

---

Success

```css
#22C55E
```

Warning

```css
#F59E0B
```

Error

```css
#EF4444
```

Info

```css
#3B82F6
```

---

# SECTION 4

# DARK MODE COLOR SYSTEM

Primary Green

```css
#1FA971
```

(unchanged)

---

Primary Blue

```css
#2563EB
```

(unchanged)

---

Background

```css
#0B0F14
```

---

Surface

```css
#111827
```

---

Card Background

```css
#1F2937
```

---

Primary Text

```css
#F9FAFB
```

---

Secondary Text

```css
#9CA3AF
```

---

Border

```css
#374151
```

---

Rule

Dark Mode = Replace White With Black Family

Green and Blue remain brand colors.

---

# SECTION 5

# TYPOGRAPHY SYSTEM

Primary Font

Inter

Fallback

System Sans

---

Heading Sizes

H1

48px

---

H2

36px

---

H3

30px

---

H4

24px

---

H5

20px

---

Body

16px

---

Small Text

14px

---

# SECTION 6

# SPACING SYSTEM

Base Unit

4px

Scale

4

8

12

16

24

32

48

64

96

---

Never use random spacing.

---

# SECTION 7

# BORDER RADIUS SYSTEM

Small

8px

Medium

12px

Large

16px

Extra Large

24px

---

Cards

12px

Buttons

12px

Inputs

12px

---

# SECTION 8

# SHADOW SYSTEM

Light Mode

Subtle shadows only.

Example

```css
0px 2px 8px rgba(0,0,0,0.08)
```

---

Dark Mode

Very soft elevation.

Never use heavy shadows.

---

# SECTION 9

# LAYOUT SYSTEM

Max Container Width

1440px

---

Standard Content Width

1280px

---

Sidebar Width

280px

---

Collapsed Sidebar

80px

---

# SECTION 10

# NAVIGATION SYSTEM

Desktop

Left Sidebar

Top Header

Content Area

---

Mobile

Bottom Navigation

Floating Actions

---

# SECTION 11

# BUTTON SYSTEM

Primary Button

Green Background

White Text

---

Secondary Button

Blue Background

White Text

---

Outline Button

Transparent

Border

---

Danger Button

Red

---

Ghost Button

Transparent

Minimal

---

# SECTION 12

# INPUT SYSTEM

Standard Input

Label

Input

Helper Text

Error State

---

States

Default

Focus

Success

Error

Disabled

---

# SECTION 13

# CARD SYSTEM

Used For

Patients

Appointments

Analytics

Tasks

Reports

---

Structure

Header

Content

Footer

---

# SECTION 14

# TABLE SYSTEM

Supports

Search

Sort

Filters

Pagination

Bulk Actions

Export

---

Used Across Entire Platform.

---

# SECTION 15

# DASHBOARD SYSTEM

Structure

Summary Cards

↓

Charts

↓

Recent Activity

↓

Action Items

---

Used For

Admin

Doctor

Manager

Patient

---

# SECTION 16

# CHART SYSTEM

Library

Recharts

---

Chart Types

Line

Bar

Area

Pie

Progress

Heatmaps

---

Colors

Green

Blue

Neutral Gray

---

# SECTION 17

# STATUS COLORS

Active

Green

---

Pending

Yellow

---

Completed

Blue

---

Cancelled

Gray

---

Critical

Red

---

# SECTION 18

# PATIENT PROFILE DESIGN

Layout

Patient Header

↓

Tabs

Overview

Timeline

Appointments

Consultations

Prescriptions

Documents

Invoices

Messages

Tasks

---

Single Patient Workspace.

---

# SECTION 19

# CONSULTATION SCREEN DESIGN

Most Important Screen

Layout

Patient Context

Left

↓

Consultation Workspace

Center

↓

AI Assistant

Right

---

Doctor never changes screens.

---

# SECTION 20

# APPOINTMENT SCREEN DESIGN

Calendar View

Day

Week

Month

---

Color Coding

Completed

Green

Pending

Blue

Cancelled

Gray

Missed

Red

---

# SECTION 21

# ANALYTICS SCREEN DESIGN

Top

KPIs

↓

Charts

↓

Insights

↓

Detailed Tables

---

Simple and executive-friendly.

---

# SECTION 22

# TASK MANAGEMENT DESIGN

Inspired By

Linear

ClickUp

Notion

---

Views

List

Board

Calendar

---

# SECTION 23

# PATIENT APP DESIGN

Simple

Large Buttons

Easy Navigation

Senior-Friendly

---

Primary Tabs

Home

Appointments

Reports

Prescriptions

Profile

---

# SECTION 24

# MOBILE RESPONSIVENESS

Desktop First

↓

Tablet

↓

Mobile

---

All screens responsive.

---

# SECTION 25

# ACCESSIBILITY

Minimum Contrast

WCAG AA

---

Keyboard Navigation

Supported

---

Screen Reader Friendly

Supported

---

Color Blind Friendly Indicators

Supported

---

# SECTION 26

# MICRO INTERACTIONS

Loading States

Skeletons

---

Success States

Animations

---

Notifications

Toasts

---

Form Saves

Visual Confirmation

---

# SECTION 27

# EMPTY STATES

Every module should include:

Illustration

Explanation

Call To Action

---

Example

"No patients yet."

Create Patient

---

# SECTION 28

# DESIGN TOKENS

Colors

Typography

Spacing

Radius

Shadows

Animations

---

Stored Centrally

---

# SECTION 29

# COMPONENT LIBRARY

Core Components

Button

Input

Select

Modal

Drawer

Table

Badge

Avatar

Tabs

Calendar

Card

Chart

Toast

Tooltip

Pagination

---

Reusable across platform.

---

# SECTION 30

# FOUNDER NOTES

Never sacrifice usability for beauty.

Doctors use software all day.

The platform should reduce cognitive load.

The design goal is:

Professional enough for hospitals.

Simple enough for a receptionist.

Modern enough to compete with SaaS products.

---

# SECTION 31

# MASTER SUMMARY

ClinicOS uses a healthcare-first design language built around Green, Blue, and White in light mode, with Green, Blue, and Black-based surfaces in dark mode. The system emphasizes clarity, speed, accessibility, consistency, and trust while supporting doctors, staff, administrators, and patients through a unified component architecture and responsive design framework.
