# AeroBridge Dashboard

A modern Learning Management System dashboard built with Next.js, Tailwind CSS, and Supabase. Designed for deployment on Vercel.

## Features

- **Dashboard** — Overview stats, enrollment charts, completion rates, activity feed
- **Courses** — Manage courses with chapters, lessons, and enrollment tracking
- **Students** — Track learner profiles, progress, and completions
- **Batches** — Group learners into cohorts with capacity management
- **Quizzes** — Create assessments with scoring and pass rate analytics
- **Certificates** — Issue and manage completion certificates

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Auth + Database)
- **Lucide Icons**

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials
4. Run the dev server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Deploy to Vercel

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add your environment variables in Vercel project settings
4. Deploy

## License

AGPL-3.0
