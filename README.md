# AeroBridge Dashboard — Aviation Learning Management System

A full-featured LMS built for aviation and drone training organizations. Manage courses, track certifications, log flight hours, schedule live classes, and ensure regulatory compliance — all from one platform.

Built with **Next.js 14**, **Supabase**, **Tailwind CSS**, and **TypeScript**.

---

## Features

### Authentication & Roles
- Email/password login with Supabase Auth
- Three roles: **Admin**, **Instructor**, **Student**
- Role selection during signup
- Email confirmation flow
- Password reset via email
- 3-step onboarding wizard (profile → notifications → done)
- Role-based sidebar navigation and page access

### Dashboard
- Real-time stats from database (students, courses, batches, certificates, staff, classes, assignments)
- Enrollment & completions chart (dynamic from `monthly_stats` view)
- Completion rate ring
- Top courses by enrollment
- Quick Start guide when platform is empty
- Activity feed

### Course Management
- Create, edit, delete, publish/unpublish courses
- Categories: Operations, Navigation, Certification, Technical, Safety, General
- Course cards with instructor, chapter/lesson counts, enrollment numbers
- Role-guarded: only admins/instructors can create/edit

### Aviation-Specific
- **Certifications & Compliance** — Track FAA Part 107, EASA, medical certificates with expiry dates, status (active/expiring/expired), auto-renewal reminders
- **Flight Logbook** — Log flight hours, aircraft type, departure/arrival, PIC/SIC/dual/solo/instrument/night time, simulator hours, instructor endorsements
- **Learning Paths** — Ordered course sequences with prerequisites, sequential unlocking, role-specific paths, progress tracking
- **Reports** — Compliance status, training completion, quiz performance, certification expiry reports

### Learning
- **Batches** — Group students into cohorts, link to courses, capacity tracking
- **Live Classes** — Schedule virtual sessions with meeting links, instructor, duration, attendee tracking
- **Quizzes** — Create with question count, passing scores, average score tracking
- **Assignments** — Create with due dates, max scores, submission tracking, draft/active/closed status
- **Certificates** — Issue with auto-generated IDs, copy/download/view actions
- **Discussions** — Q&A forum with resolve/reopen, reply counts, course linking (open to all roles)
- **Announcements** — Priority levels (low/normal/high/urgent), pin to top, course-specific or general

### People Management
- **Students** — Add, search, track enrollment/completion/progress (admin/instructor)
- **Staff** — Add employees with role, department, phone, email/call actions (admin only)
- **Attendance** — Record daily check-in/out, hours worked, status (present/remote/late/absent) (admin only)
- **User Management** — View all users, filter by role, change roles via dropdown (admin only)

### Schedule & Communication
- Calendar view grouped by date
- Event types: class, meeting, deadline, event, review (color-coded)
- Location and attendee tracking

### Settings
- Profile editing (name, department, phone, bio)
- Email notification preferences (announcements, assignments, grades, discussions, schedule)
- Password change

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Hosting | Vercel |

---

## Database Schema

**18 tables** + **2 views**, all with Row Level Security enabled:

**Core LMS:** `courses`, `students`, `batches`, `quizzes`, `certificates`, `assignments`, `live_classes`, `enrollments`, `course_content`

**Aviation:** `certifications`, `flight_logbook`, `learning_paths`, `learning_path_courses`

**Communication:** `announcements`, `discussions`, `activity_feed`, `schedule`

**People & Auth:** `profiles` (linked to `auth.users`), `employees`, `attendance`, `notification_settings`, `invite_codes`

**Views:** `dashboard_stats`, `monthly_stats`

---

## Project Structure

```
src/
├── app/
│   ├── login/                  # Auth: login page
│   ├── signup/                 # Auth: signup with role picker
│   ├── forgot-password/        # Auth: password reset
│   ├── onboarding/             # 3-step onboarding wizard
│   ├── auth/confirm/           # Email confirmation route handler
│   ├── settings/               # Profile, notifications, password
│   ├── courses/                # Course CRUD
│   ├── students/               # Student management
│   ├── employees/              # Staff management
│   ├── batches/                # Batch/cohort management
│   ├── live-classes/           # Virtual class scheduling
│   ├── quizzes/                # Quiz management
│   ├── assignments/            # Assignment management
│   ├── certificates/           # Certificate issuance
│   ├── certifications/         # Aviation cert tracking
│   ├── logbook/                # Flight hours logbook
│   ├── learning-paths/         # Learning path builder
│   ├── reports/                # Analytics & compliance reports
│   ├── announcements/          # Broadcast announcements
│   ├── discussions/            # Q&A forum
│   ├── schedule/               # Calendar events
│   ├── attendance/             # Staff attendance
│   ├── users/                  # Admin user management
│   └── page.tsx                # Dashboard
├── components/
│   ├── AppShell.tsx            # Auth gating + layout
│   ├── Sidebar.tsx             # Role-based navigation
│   ├── Header.tsx              # User info + search
│   ├── Modal.tsx               # Reusable modal + form helpers
│   ├── Toast.tsx               # Success/error notifications
│   ├── EmptyState.tsx          # Empty page CTA
│   ├── StatCard.tsx            # Dashboard stat cards
│   └── RoleGuard.tsx           # Page/element role restriction
├── contexts/
│   └── AuthContext.tsx          # Global auth state
└── lib/
    ├── supabase.ts             # Client + interfaces
    └── data.ts                 # CRUD functions
```

---

## Role Permissions

| Feature | Admin | Instructor | Student |
|---------|:-----:|:----------:|:-------:|
| Dashboard, Schedule, Announcements | ✅ | ✅ | ✅ view |
| Courses, Classes, Quizzes, Certificates | ✅ CRUD | ✅ CRUD | ✅ view |
| Certifications, Logbook, Learning Paths | ✅ CRUD | ✅ CRUD | ✅ own |
| Batches, Assignments | ✅ | ✅ | hidden |
| Reports | ✅ | ✅ | hidden |
| Students | ✅ | ✅ view | blocked |
| Staff, Attendance | ✅ | blocked | blocked |
| User Management | ✅ | blocked | blocked |
| Discussions | ✅ | ✅ | ✅ post |
| Settings | ✅ own | ✅ own | ✅ own |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Supabase project

### Setup

```bash
git clone https://github.com/Aerobridgeadmin/aerobridge-dashboard.git
cd aerobridge-dashboard
npm install
```

Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deployment

Deployed on **Vercel** with automatic GitHub integration. Push to `main` triggers a new deployment.

---

## License

Private — AeroBridge © 2026
