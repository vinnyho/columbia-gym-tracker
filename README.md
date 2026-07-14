# Columbia Gym Facility Tracker

Crowdsourced facility tracker for Columbia's Dodge Fitness Center. Students can check Blue Gym activity, Levien availability, equipment status, and recent outage reports before walking over. Built with a React frontend, an Express API, Supabase Postgres/Auth, and AWS S3 presigned uploads for photo-backed reports.

> Built as a practical campus tool and full-stack systems project.

## What it does

- Shows current Dodge Fitness Center hours and facility status
- Pulls Blue Gym activity from Columbia's public recreation calendar
- Tracks Levien Gymnasium availability separately from Blue Gym court activity
- Lists equipment across the bottom, second, and top floors with floor/category/status filters
- Lets Columbia-authenticated users submit issue reports, comments, votes, and photos
- Derives equipment status from student reports using weighted votes and time decay
- Stores persistent reports/comments/votes in Supabase Postgres
- Uploads report photos directly to private S3 objects through presigned URLs

## Architecture

Production:

    Vercel frontend (Vite + React)
             |
             v
    Vercel Express service  -->  Supabase Auth
             |
             |--> Supabase Postgres
             |      reports, comments, votes
             |
             |--> AWS S3
             |      presigned report photo uploads
             |
             `--> Columbia / Perec calendar
                    Blue Gym schedule data

Local development:

    frontend/ npm run dev       http://localhost:5173
              |
              v
    backend/ npm run dev        http://localhost:5001

Socket.io support exists in the backend for live update broadcasts, but production on Vercel currently uses manual refresh because Vercel Services are not ideal for long-running WebSocket connections.

## Features

- Columbia-only login with Supabase magic links and backend token verification
- Report creation for equipment and spaces
- Comment threads on reports
- One vote per signed-in user per report
- Weighted report scoring with time decay so stale reports lose influence
- Equipment availability derived from active report signals
- S3 presigned PUT uploads for report photos
- Signed S3 GET URLs for private photo display
- Mobile-first responsive UI with Columbia blue styling
- GitHub Actions CI for backend build, frontend build, and frontend lint
- Vercel Services deployment for the frontend and API in one repo

## Tech stack

React, TypeScript, Vite, Node.js, Express, PostgreSQL, Supabase Auth, Supabase Postgres, AWS S3, Socket.io, Redis-ready pub/sub, GitHub Actions, Vercel

## Getting started

Install dependencies separately because the repo is split into frontend and backend services.

    cd backend
    npm install

    cd ../frontend
    npm install

Create backend environment variables:

    cd backend
    cp .env.example .env

Required backend variables:

    PORT=5001
    DATABASE_URL=postgresql://...
    SUPABASE_URL=https://your-project-ref.supabase.co
    SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
    AWS_REGION=us-east-1
    S3_BUCKET_NAME=your-report-photo-bucket
    AWS_ACCESS_KEY_ID=your_access_key
    AWS_SECRET_ACCESS_KEY=your_secret_key
    NODE_ENV=development

Required frontend variables:

    VITE_SUPABASE_URL=https://your-project-ref.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key

Start the API:

    cd backend
    npm run dev

Start the frontend:

    cd frontend
    npm run dev

Then open:

    http://localhost:5173

## Database

The schema lives in:

    backend/src/schema.sql

It defines:

- facilities
- spaces
- schedule blocks
- equipment
- reports
- comments
- report votes
- Supabase auth hook for Columbia email enforcement

Apply the schema to Supabase before using persistent reports.

## Deployment notes

The repo uses `vercel.json` with two services:

    frontend/  Vite service
    backend/   Express service

For Vercel + Supabase, use the Supabase transaction pooler connection string for `DATABASE_URL`, not the direct `db.<project>.supabase.co` URL. Vercel is IPv4-only in this setup, and the Supabase pooler avoids direct IPv6 connection issues.

For S3 uploads, configure bucket CORS to allow your local and production frontend origins:

    [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT"],
        "AllowedOrigins": [
          "http://localhost:5173",
          "https://your-vercel-domain.vercel.app"
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
      }
    ]

## Project structure

    backend/
    |-- src/index.ts      Express app, API routes, scoring, persistence, S3 signing
    |-- src/server.ts     Local HTTP + Socket.io server wrapper
    `-- src/schema.sql    Postgres schema and Supabase auth hook

    frontend/
    |-- src/App.tsx       Single-page React app and UI state
    |-- src/App.css       App layout, desktop/mobile styling
    `-- src/index.css     Global theme variables

    .github/workflows/
    `-- ci.yml            Backend build, frontend build, frontend lint, guarded deploy

    vercel.json           Vercel Services routing for frontend + API

## Status

Core reporting, comments, voting, time decay, photo uploads, Supabase persistence, Columbia auth, CI, and Vercel deployment are live. Production realtime is intentionally disabled on Vercel; the backend Socket.io path remains available for a future long-running deployment target or a Supabase Realtime replacement.
