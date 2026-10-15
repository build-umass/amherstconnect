default:
    @just --list

# Install root, mobile, and server dependencies
install:
    npm ci
    npm --prefix apps/mobile ci
    npm --prefix server ci

# Start Metro for the development build (requires emulator running and dev build installed; press `a` for Android). Pass --clear after env changes.
mobile *args:
    cd apps/mobile && npx expo start --dev-client {{args}}

# Confirm the Android emulator is connected
devices:
    adb devices

# Start the server (runs without Firebase Admin credentials)
server:
    cd server && npm start

# Start the server with nodemon auto-reload
server-dev:
    cd server && npm run dev

# Run full credential-free verification, same as CI (requires Java 21)
verify:
    npm run verify

# Run Firestore rules tests and server tests
test:
    npm test

# Type-check the mobile app
typecheck:
    npm run typecheck

# Check native bundle exports for iOS and Android
export:
    cd apps/mobile && npx expo export --platform ios --output-dir /tmp/amherst-connect-ios
    cd apps/mobile && npx expo export --platform android --output-dir /tmp/amherst-connect-android

# Start the local Supabase stack (requires Docker)
db-start:
    npx supabase start

db-start-native:
    npx supabase start --native

# Stop the local Supabase stack
db-stop:
    npx supabase stop

# Reset the local database: re-run migrations and load supabase/seed.sql
db-reset:
    npx supabase db reset

# Run the database RLS tests (pgTAP) against the local stack
db-test:
    npx supabase test db

# Regenerate supabase/seed.sql from supabase/scripts/seed-data.mjs
seed:
    npm run db:seed:generate

# Fail if supabase/seed.sql is out of date with seed-data.mjs
seed-check:
    npm run db:seed:check
