# Auto-update repair — 2026-10-13

The release repository was private while clients used the anonymous GitHub provider. Anonymous manifest requests returned 404. At the user's explicit request, `king-of-Jupiter/hopdock` was made public. The existing published v0.0.6 feed and Windows installer are now accessible without a token.

Runtime fixes:
- A singleton update controller handles the application's check/download/install lifecycle, including `update-not-available`.
- Status snapshots and monotonically increasing revisions preserve progress and the ready-to-install state when Settings is reopened.
- Checks and downloads are deduplicated; failed checks can be retried. A downloaded update is not discarded by a second check.
- Startup checks run after 20 seconds, followed by checks every six hours while the app runs. Timers are canceled on quit; recreated windows do not duplicate updater handlers.
- Installation remains gated on a completed download and requests a silent NSIS install with relaunch. Auto-install on quit is retained.
- Settings now explicitly reports that the app is up to date, shows the last check, and disables duplicate checks while checking/downloading/ready.

Release preparation fixes (local workflow changes, not a new published release):
- macOS packaging includes ZIP as well as DMG; Squirrel.Mac updates need the ZIP.
- Releases build into a draft and become public/latest only after every platform finishes, avoiding partially uploaded update feeds.
- The workflow checks tag/package-version equality and refuses to overwrite a published release.

Validation:
- Four update-controller tests cover current-version results, concurrent checks, progress, downloaded state, failed check/download retries, development mode and installation gating.
- A real Electron/NSIS GitHub-provider probe confirmed v0.0.6 is current, simulated v0.0.5 downloaded the published v0.0.6 installer (82,657,745 bytes) with electron-updater's checksum verification, and dispatched silent-install/relaunch options. The fixture intercepted installer execution; it did not replace the user's installed app. Results: `docs/updater-real-results.json`.
- 26 Electron application scenarios and 15 browser checks passed, including status restoration when Settings is reopened.
- Typecheck, production build, YAML workflow parsing and Windows packaging passed.

Commands: `npm run test:updates`, `npm run test:updates:real` (Windows + internet), `npm run test:desktop`, `npm run test:ui`.

## Update configuration in directory builds

The 2026-10-13 directory-only build lacked resources/app-update.yml because electron-builder normally generated it when building installer targets. This caused ENOENT during startup/manual checks, incorrectly reported as FILE_MISSING.

The configuration is now a required extraResource copied from apps/desktop/build/app-update.yml in every packaged build, including --dir. It includes the public GitHub provider and updater cache name. Missing/unreadable updater configuration has the dedicated UPDATE_CONFIG message and recovery hint, before general file-error rules.

Validation: seven controller/error-catalog tests, typecheck and production build passed. A new --dir package was verified to contain app-update.yml. The real GitHub-provider probe now obtains the current version's feed from the configuration file without setFeedURL and passed; the older-version probe again downloaded and verified the published installer. The installer dispatch remains intercepted for isolation.
