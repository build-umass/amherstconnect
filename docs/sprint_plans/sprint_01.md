# Sprint 1 — Plan

**Status:** In progress  
**Last updated:** 2026-04-22

---

## Goal

Stand up authentication and onboarding so a user can create an account (email or Google), pick a role, pick their interests, and land in the main app — with the right guards keeping them out of screens they shouldn't see.

---

## Tasks

### Authentication & Onboarding

| # | Task | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Firebase Auth integration | Brian | Pending | Email/password, Google OAuth, session persistence across app restarts. |
| 2 | Route guard logic | Brian | Pending | Redirect unauthenticated users to login. Redirect users with incomplete onboarding into the onboarding flow. |
| 3 | Firestore user + profile creation | Brian | Pending | On sign-up, create `users` doc and the role-based profile doc (`student_profiles`, etc.). |
| 4 | Login screen | Shreyansh | Pending | Email/password fields, Google sign-in button, link to sign-up. |
| 5 | Sign-up screen | Shreyansh | Pending | Email/password fields, validation, error handling (email already exists, weak password, etc.). |
| 6 | Role selection screen (onboarding 1) | Shreyansh | Pending | Student / Faculty & Staff / Alumni / Local Resident. Saves role to `users` doc. |
| 7 | Interest tag screen (onboarding 3) | Shreyansh | Pending | Multi-select interest tags (Dining, Music, Sports, Cultural, RSO, etc.). Saves to Firestore. |

_More tasks will be added below as other team members' work is scoped into this sprint._
