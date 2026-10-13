# Keychain and WinSCP — 2026-10-13

- Host authentication supports SSH key + account password. The key is tried first; the password can complete multi-factor authentication or serve as a fallback. Password keyboard-interactive challenges are supported; arbitrary OTP challenges are not answered with a stored password.
- Clicking a Keychain entry opens a themed side panel. It reads private material only for the selected entry. Label, private key and its unlocking passphrase can be edited. Saving validates the key before changing files or metadata and preserves the key id used by hosts. Public key and fingerprint are regenerated.
- Export supports the original private-key file (byte-preserved text, including existing encryption) and PuTTY v2 `.ppk` for RSA, ECDSA and Ed25519. Protected PPK exports retain the saved passphrase.
- Windows host menus include **Open in WinSCP**. WinSCP is detected in standard installation locations, PATH and App Paths, or selected in Settings. The integration launches a new SFTP instance. Account passwords are passed through credential files; the temporary PPK is encrypted with a random passphrase. Temporary files are removed when that instance exits or Hopdock quits. SSH-agent sessions use WinSCP's agent support. Jump-host sessions return an explicit unsupported error.
- File selection and saving use Electron's native OS dialogs, including multiple upload selection, cancellation and overwrite confirmation. Forms, key editors, text prompts and confirmations remain in Hopdock's theme.

## Validation

- 23 Electron scenarios against isolated profiles and a local SSH/SFTP fixture, including native-dialog IPC stubs, actual protected-key authentication, host edits, key editing/export and two-device encrypted sync.
- 12 existing SSH/SFTP checks plus 4 real-SSH combined-authentication tests, including both password and keyboard-interactive second factors and wrong-password rejection.
- 14 build/configuration, encrypted sync and PPK tests. The installed WinSCP accepted encrypted and unencrypted RSA, ECDSA and Ed25519 PPK exports.
- Real installed WinSCP SFTP listing against a pinned loopback server, using password, private key, and combined credentials: all three passed (`npm run test:winscp`).
- 10 Chromium UI smoke checks; typecheck and production build.

Reference behavior: [termorator WinSCP integration](https://github.com/king-of-Jupiter/termorator/blob/main/src/main/kotlin/app/termora/plugin/internal/ssh/WinSCP.kt). Protocol and launch arguments: [WinSCP command line](https://winscp.net/eng/docs/commandline). SSH authentication contract: [ssh2](https://github.com/mscdex/ssh2).
