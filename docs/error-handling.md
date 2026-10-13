# Error handling — 2026-10-13

Errors now use a shared catalog in `packages/core/src/errors.ts`: stable codes, readable titles, explanations and recovery hints. It covers missing/invalid/encrypted keys, credentials, SSH authentication and challenges, DNS/network/connection failures, filesystem/SFTP errors, WinSCP discovery/startup, encrypted sync/account/database errors, update failures and invalid local vault data. Unknown exceptions receive a safe fallback rather than their raw message.

Main IPC handlers return typed error envelopes because Electron does not reliably preserve Error properties. Preload rejects the envelope; the renderer resolves it back to the catalog. Original credentials, raw IPC wrappers, stacks and private-key text are not included in displayed diagnostic details.

Operational errors use themed notices: title, explanation, next step, optional navigation/retry, dismiss button and collapsed code/operation details. Background operations use persistent notifications in the bottom-right corner, deduplicated and limited to three visible items. Form errors remain inside their form; SSH/SFTP errors remain beside the failed operation. Small validation hints remain beside invalid fields.

Promise rejections have a notification fallback, and a React error boundary provides an interface reload screen. Corrupt local vault data is rejected without overwriting it or substituting demo entries.

Validation: 25 Electron scenarios passed, including a deliberately missing private key and a corrupt isolated vault; 13 browser checks passed, including notification deduplication, retry, navigation, dismissal and a background rejection with secret-like text. Three error-catalog tests cover 32 representative failures, SFTP status codes, HTTP errors, transport serialization and safe fallback. Typecheck, production build and Windows packaging passed.

Native captures: `docs/design/error-notification-dark.png` and `docs/design/error-notification-light.png`. Component capture: `docs/design/error-notice-detail.png`.
