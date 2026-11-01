# Expo patch checks and update PRs

## Reproducible ordinary verification

After clean root and mobile `npm ci`, use `npm --prefix apps/mobile run check:expo`.
It checks every direct installed version against the committed manifest/lockfile,
then runs the real Expo `install --check` in `EXPO_OFFLINE=1` mode. Compatibility
is evaluated against the metadata shipped in the locked `expo` package. Missing
packages, incompatible versions and validation exclusions fail the check.
No dependency validation is disabled. This command also runs in normal `verify` CI.

Expo's online CLI combines `/v2/sdks/<sdk>/native-modules` with
`/v2/versions/latest`; live recommendations override bundled values. New patch
recommendations can therefore fail an unchanged clean installation. Offline
mode intentionally does not discover those new recommendations. For an explicit
network-dependent check, use `npm --prefix apps/mobile run check:expo:latest`.

## Scheduled and manual updates

`Expo SDK patches` runs Mondays at 14:17 UTC or via **Run workflow** on the
repository's default branch. It always checks out current `dev`.

- Reads the official Expo metadata for the **locked SDK major**, then npm registry
  versions. Only stable patch increases within each installed package's current
  major/minor are eligible. Unmapped packages, SDK upgrades, downgrades and
  prereleases are excluded; recommendations requiring non-patch changes fail with
  a manual-review message. No audit fixes are run.
- Updates the mobile manifest and lockfile together, checks direct/transitive
  scope, runs clean mobile installation, locked compatibility and repository
  verification. A failed update restores both package files. No-update runs
  leave both files untouched and skip publication.
- Publishes only those two files to one reserved branch, `chore/expo-sdk-patches`,
  and creates/updates one draft PR targeting `dev`. Keep human changes off that
  automation branch. A global concurrency group serializes scheduled/manual runs.
  If `dev` advances during preparation, publication fails; rerun it.
- Detects changed native package files/metadata and flags Android APK and iOS
  development-app rebuild/runtime checks in the PR. Detection is conservative;
  review all lockfile changes. It never starts EAS builds, deploys or auto-merges.

Before full verification, a snapshot step records the artifact digest and checks
both package files against the workspace. After verification, sealing checks that
the digest has not changed and compares both package files byte-for-byte again. It sends a digest of all four artifact
files through a separate job output. Publication rejects any artifact that no
longer matches that receipt, even if its internal hashes were rewritten.

The publication job uses a fresh runner and independently derives the changed
direct packages from the before/after lockfiles. It fetches official metadata for
the base SDK, rejects non-Expo-managed updates and checks every managed direct
version against that SDK's recommendations before minting write credentials.
Exact, tilde and caret stable ranges are supported; other range syntax fails
closed for manual review. Metadata/network failures also stop publication.
The job does not execute npm/app code. The normal `verify` and
`verify-supabase` PR jobs remain required review evidence; this is not a replacement
for branch protection or human approval. GitHub Actions compute still consumes
the repository's normal Actions allowance.

## Required repository setup (not performed by this change)

1. The current default branch is **`main`**. Scheduled workflows run only from
   the default branch, and manual dispatch requires registration there. Promote
   the approved workflow to `main` through normal review, or separately approve
   making `dev` the default branch. Merging only to `dev` does not activate the
   schedule. Dispatch from the default branch; arbitrary branch dispatches are
   deliberately skipped. The scripts and root dependencies must be merged to `dev`.
2. Install a dedicated GitHub App on **only this repository**, with Contents
   read/write, Pull requests read/write and GitHub's mandatory Metadata read.
   Store its client ID in repository variable `EXPO_PATCH_APP_CLIENT_ID` and its
   private key in Actions secret `EXPO_PATCH_APP_PRIVATE_KEY`. No PAT, workflow-write,
   cloud, Firebase, Supabase, Expo token or build credential is required.
3. Allow the pinned actions under the organization/repository Actions policy.
   The inspected policy currently allows all actions. Maintain review/required
   checks on `dev`; no App bypass or automatic merging is needed.

The default `GITHUB_TOKEN` is read-only here. Current GitHub behavior puts PR
workflows created by that token in an approval-required state (older behavior
suppressed them). The scoped App token performs both branch pushes and PR
creation/updates so normal PR CI can start automatically. There is no silent
fallback to `GITHUB_TOKEN`. Missing App settings fail publication with instructions;
no-update runs need no App credential. The App token is revoked at job completion.

## Local checks

```sh
npm run test:expo-tooling
npm --prefix apps/mobile run check:expo
npm --prefix apps/mobile run check:expo:latest
```

`node scripts/update-expo-patches.mjs` performs the actual online update locally.
Run it only in a clean disposable checkout when testing. It never pushes or
creates a PR itself. On failure, package files are restored but `node_modules`
may reflect the attempted update; run mobile `npm ci` before continuing.

Sources: [Expo CLI environment variables](https://docs.expo.dev/more/expo-cli/#environment-variables),
[GitHub token-triggered workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[schedule and dispatch events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[App tokens](https://github.com/actions/create-github-app-token),
[create-pull-request](https://github.com/peter-evans/create-pull-request).
