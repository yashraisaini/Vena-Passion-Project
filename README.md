# VENA — Smart Infusion Companion

A React + Vite + Supabase web app for hemophilia and von Willebrand disease medication tracking.
https://vena-passion-project.vercel.app

## Stack
- **Frontend**: React 18, Vite, CSS Modules, GSAP (scroll animations)
- **Backend/Auth**: Supabase (Postgres + Google OAuth)
- **Routing**: React Router v6
- **Deployment**: Vercel or Netlify (frontend) + Supabase (backend)

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
## Disclaimer
VENA is a personal passion project and educational tool. Factor level estimates are population averages from published clinical trial data and are not personalized medical advice. Always follow guidance from your hemophilia treatment centre.
