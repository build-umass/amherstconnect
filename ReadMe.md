# Amherst Connect

**Amherst Connect** is a mobile-first community platform for UMass Amherst students, faculty, alumni, and local residents. The app consolidates fragmented information currently scattered across Instagram pages, flyers, websites, and word-of-mouth into a single intuitive hub.

This is a collaborative initiative between two organizations: **BUILD UMass** is responsible for development, implementation, and maintenance of the app; **180 Degree Consulting** is responsible for research, content strategy, and community/business partnerships.

---

## Features

- **Auth + Onboarding** — Role-based sign-up (Student, Faculty, Alumni, Local Resident) with interest tag personalization
- **Event Feed + Search** — Browse and search upcoming campus and community events with category filters
- **Interactive Campus Map** — Google Maps integration with event pins, time filters, and tap-to-preview
- **Community Deals** — Discover and claim local business discounts
- **Resource Directory** — Browse community organizations and services
- **Bookmarks** — Save events and access them from your profile
- **Push Notifications** — Stay updated on events and announcements relevant to your interests

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React Native (Expo) |
| Backend | Node.js + Express |
| Database & Storage | Firebase (Firestore + Storage) |
| Maps | Google Maps API |
| Auth | Firebase Auth |
| Notifications | Expo Push (FCM + APNs) |
| Hosting / Deployment | Firebase Hosting + App Distribution |

---

## Project Structure

```
amherstconnect/
├── apps/
│   └── mobile/          ← Expo React Native app
├── server/              ← Node.js + Express API
├── docs/                ← PRD, ERD, workflow docs
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── ISSUE_TEMPLATE/
├── .gitignore
└── .env.example
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [Git](https://git-scm.com/)
- [Expo Go](https://expo.dev/client) on your phone (for testing)

### Setup

1. Clone the repository and switch to the dev branch:
   ```bash
   git clone https://github.com/build-umass/amherstconnect.git
   cd amherstconnect
   git checkout dev
   ```

2. Install dependencies:
   ```bash
   cd apps/mobile
   npm install
   ```

3. Add environment variables — create `apps/mobile/.env` using the template:
   ```bash
   cp .env.example apps/mobile/.env
   # Fill in values
   ```

4. Run the app:
   ```bash
   npx expo start
   ```
   Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

5. Create your feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

> **Note:** Never commit `.env`, `google-services.json`, or `GoogleService-Info.plist`. These are in `.gitignore` and must be shared privately via Slack DM only.

---

## Documentation

Comprehensive documentation is available in the [`/docs`](./docs) folder:

---

## Links

- [Figma](https://www.figma.com/design/g4aenc7jjiKSMHfS8hwFWU/Amherst-Connect?node-id=0-1&t=DfYE6wG8cJliXXEi-1)
- [Workflow Management Document](https://docs.google.com/document/d/1GmvhQZdf7W-1cp-iRpTnM89YjmaMQmY1Ihyxk9F1U8Q/edit?usp=sharing)
- [PRD](https://docs.google.com/document/u/2/d/1Pm-wB35ieWZV4EYcHT5suIrRBiGmVxadFgMVCgfLxs4/edit?usp=sharing)

---

## Resources for Developers

### React Native + Expo (Frontend)
- https://reactnative.dev/docs/getting-started
- https://docs.expo.dev
- https://docs.expo.dev/tutorial/introduction

### Firebase (Auth + Firestore + Storage)
- https://firebase.google.com/docs
- https://firebase.google.com/docs/firestore
- https://docs.expo.dev/guides/using-firebase
- https://rnfirebase.io/auth/usage
- https://rnfirebase.io/firestore/usage

### Google Maps (react-native-maps)
- https://docs.expo.dev/versions/latest/sdk/map-view
- https://www.applighter.com/blog/react-native-google-maps
- https://dev.to/dainyjose/seamless-map-integration-in-react-native-a-complete-guide-29o7
- https://dev.to/dainyjose/building-a-location-picker-in-react-native-maps-with-draggable-marker-address-lookup-1d00
- https://nicolalazzari.ai/articles/understanding-google-maps-apis-a-comprehensive-guide-to-uses-and-costs

### Node.js + Express (Backend)
- https://dev.to/anticoder03/building-restful-apis-with-nodejs-and-express-step-by-step-tutorial-2oc6
- https://blog.postman.com/how-to-create-a-rest-api-with-node-js-and-express

### Push Notifications (Expo + FCM)
- https://docs.expo.dev/push-notifications/push-notifications-setup
- https://docs.expo.dev/push-notifications/overview

---

## Development Team

Amherst Connect is being developed by [**BUILD UMass**](https://buildumass.com/), a student-led software development organization at the University of Massachusetts Amherst.

### Spring 2026

| Role | Name |
|------|------|
| Project Lead | Brian Nguyen |
| Project Managers | Shriya Sanas, Adya Joshi |
| Software Developers | Sonny Zhang, Camila Rivera de Jesus, Anish Kamath, Kushagra Aitha, Damian Phimister, Pranav Ravi Buregoni, Maya Nedkova |

---

## Acknowledgments

- **180 Degrees Consulting UMass** — Client and community partner
- **BUILD UMass** — Student development team

---

## License

This project is proprietary software developed for 180 Degrees Consulting UMass. All rights reserved.
