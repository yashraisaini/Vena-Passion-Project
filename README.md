# VENA — Smart Infusion Companion

A React + Vite + Supabase web app for hemophilia and von Willebrand disease medication tracking.
https://vena-passion-project.vercel.app

## Stack
- **Frontend**: React 18, Vite, CSS Modules, GSAP (scroll animations)
- **Backend/Auth**: Supabase (Postgres + Google OAuth)
- **Routing**: React Router v6
- **Deployment**: Vercel or Netlify (frontend) + Supabase (backend)

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Go to **Settings → API** and copy your **Project URL** and **anon public** key

### 3. Configure environment variables
```bash
cp .env.example .env
```
Fill in your Supabase URL and anon key.

### 4. Enable Google OAuth in Supabase
1. In your Supabase project go to **Authentication → Providers**
2. Enable **Google**
3. Add your Google OAuth credentials (from Google Cloud Console)
4. Set your redirect URL to `http://localhost:5173` for dev, and your production URL for prod

### 5. Run the database schema
In your Supabase project go to **SQL Editor** and run the contents of `supabase/schema.sql`

### 6. Start the dev server
```bash
npm run dev
```

---

## Project Structure
```
src/
├── pages/
│   ├── Home.jsx          Hero, step guide, medication library
│   ├── Login.jsx         Google sign-in page
│   └── Dashboard.jsx     Medication management + calendar
├── components/
│   ├── Nav.jsx           Fixed navigation bar
│   ├── VeinCanvas.jsx    Animated vein network background (Canvas)
│   ├── HeroIllustration.jsx  3D hand + syringe SVG
│   ├── Library.jsx       Medication browser with filters
│   ├── MedModal.jsx      Medication detail + factor level chart
│   ├── StartDateModal.jsx    Add medication with custom schedule
│   └── Calendar.jsx      Drag-to-reschedule calendar + ICS export
├── context/
│   └── AuthContext.jsx   Supabase auth state
├── lib/
│   └── supabase.js       Supabase client
└── data/
    └── medications.js    25 medications with pharmacokinetic data
```

## Deploying to GitHub Pages / Vercel
- **Vercel** (recommended): connect your GitHub repo, add env vars, deploy
- **GitHub Pages**: run `npm run build`, push the `dist/` folder

## Disclaimer
VENA is a personal passion project and educational tool. Factor level estimates are population averages from published clinical trial data and are not personalized medical advice. Always follow guidance from your hemophilia treatment centre.
