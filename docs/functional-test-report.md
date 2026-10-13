# Hopdock functional verification — 2026-10-13

Local implemented functionality: **passed after repairs**. Production cloud sync: **blocked by database setup**.

## Evidence

- `npm run test:desktop`: **25/25 scenarios passed**, using the production main/preload/renderer bundles in real Electron on Windows with an isolated userData profile. Machine-readable results: [functional-test-results.json](functional-test-results.json).
- `npm run test:ssh`: **12 existing checks plus 4 combined-authentication tests passed** against loopback ssh2 servers.
- `npx tsx --test apps/desktop/build-supabase.test.ts apps/desktop/src/main/password-sync.test.ts apps/desktop/src/main/putty-key.test.ts`: **14/14 tests passed**.
- `npm run test:winscp`: **3/3 real WinSCP SFTP sessions passed**, with password, key and combined credentials against a pinned local fixture.
- `npm run test:ui`: **13 checks passed**, Chromium with the existing mock preload harness.
- `npm run typecheck`, production build, `git diff --check`: passed.
- `npm run dist --workspace apps/desktop`: Windows NSIS installer built successfully, approximately 83 MB.
- Packaged `Hopdock.exe --hopdock-smoke`: exit code **0**, output **hopdock smoke ok**. This checks packaged module loading; the installer was not installed over the user's application.

## Coverage

| Area | Verified |
| --- | --- |
| Native bridge and storage | Actual preload/IPC, sandbox retained, empty profile, OS-encrypted local secrets, persistence, local secret/file deletion and sync tombstones |
| Hosts | Create and validation through UI, editing without losing password, key selection, search by tags, groups, hide-grouped setting, theme/settings persistence, deletion |
| SSH | Loopback connections with password, protected Ed25519 private key, RSA/imported key and an actual local SSH-agent protocol endpoint; wrong password/unknown host errors; shell input, Unicode, resize, reconnect, stdout/stderr and nonzero exit status |
| SFTP | Both panels, actual server home directory, folder navigation without reconnecting, upload/download with exact binary content, mkdir/copy/rename/chmod/unlink/recursive deletion, corresponding context-menu bindings, prevention of copying a file over itself |
| Keychain | Actual ssh-keygen for Ed25519/RSA, fingerprints/public-key display, ordinary and passphrase-protected import, Generate/Import/Copy ID UI dialogs/buttons, ssh-copy-id followed by successful key authentication, deletion |
| Snippets | UI create/edit/delete, folder and variable fields, variable substitution, actual SSH exec and output display |
| Sync | Two real Electron processes with separate profiles use the actual Supabase SDK/Auth/PostgREST transport and main-process sync code against a local HTTP fixture. Restored passwords and private keys authenticate to the real loopback SSH server, restored snippets execute there, and deletions propagate back. Wire rows contain no plaintext passwords, passphrases, private keys or snippet script. Wrong keys, tampering, migration, failed uploads and identity binding have separate regression tests |
| Updates | Development-build check returns a clear result without hanging or an unhandled rejection. Download/restart/self-install against a production release was not performed |

The SSH server uses real SSH/SFTP protocols backed by disposable local files. Its shell/exec replies are deliberately controlled fixtures, rather than a Linux shell or proof of arbitrary bash-command compatibility. The HTTP sync fixture emulates the Supabase endpoints and ownership checks; it does not prove the live project's RLS deployment.

## Repaired defects

1. **Native preload could not load.** Electron's sandbox was receiving ESM preload; the app fell back to demo data without working IPC. Preload is now CommonJS, with sandbox and context isolation retained.
2. **Text-entry actions used unsupported `window.prompt`.** Replaced with in-app dialogs supporting cancellation, Enter/Escape and password fields. Verified the actual buttons.
3. **SFTP reconnected on each pane load**, sharing a terminal session and disrupting channels. It now owns one dedicated connection, resolves the server's actual home, reuses it for navigation/refresh and filters progress by session.
4. **Copying into the same directory could truncate the source.** Both UI and SSH service prevent self-copy before opening files.
5. **Host forms could not select or preserve a key reference.** Added key selection, auth/password validation and surfaced asynchronous save errors; permits IPv6 addresses and rejects fractional ports.
6. **Private-key import relied on ssh-keygen**, failed with Windows file ACLs and could require an interactive passphrase. It now parses keys in memory, supports protected imports, stores passphrases locally and recognizes EC keys. Deletion also removes generated `.pub` files.
7. **Failed/abandoned SSH connections were not cleaned up reliably.** Added timeout/error cleanup and guarded stale close notifications; explicit disconnect still notifies the renderer.
8. **Supabase client construction failed in Electron without native WebSocket.** Added the Node WebSocket transport; verified actual SDK calls through IPC and two-profile transfer.
9. **Update-check failures could leave the UI checking or produce rejected promises.** Development builds return an explicit result and release failures are reported through status.
10. Browser smoke test used an obsolete Settings label and competed with the user's preview port. Updated the assertion and gave tests their own port.

## Remaining limits

- Live query to the configured project `lwiwesknouzlzzxgtrod` still returns **HTTP 404 / PGRST205** for `vault_items`. The prepared migration must be deployed before production sync can work. No live account password was supplied or sent, and no real host/key/snippet data was uploaded.
- SSH certificate authentication is not implemented. Its nonfunctional create option is removed; legacy certificate hosts return an explicit unsupported error rather than pretending to use certificates. Port forwarding, Known Hosts and History remain unimplemented/hidden as before.
- Packaged Electron 33 embeds Node 20; the installed Supabase SDK prints a Node-20 deprecation warning. The exercised calls pass with explicit WebSocket transport, but future SDK upgrades require revisiting runtime compatibility.
- macOS/Linux packages, actual update installation, OS-specific agents other than the tested protocol fixture, real Internet servers and shared vaults were not exercised.

## Reproduce

Build first, then run `npm run test:desktop`. Tests require `ssh-keygen`, Electron's installed binary and a desktop session; on Linux use `xvfb-run -a npm run test:desktop`. The test launcher and network redirection exist only under `tests/desktop`; packaged application configuration cannot be overridden this way. Test profiles are retained under `hopdock-desktop-test-*` in the OS temporary directory for inspection. The user's normal vault, private keys and SSH configuration are untouched. The desktop suite is added to the GitHub build workflow.

## In-app dialogs and design update

- Message dialogs and browser confirm/alert/prompt remain inside Hopdock. Key creation/import use unified forms; Copy ID uses a host selector. Per the user's updated preference, file selection and saving now use native Electron OS dialogs, including multiple uploads and overwrite confirmation. The built-in file browser was removed.
- Electron tests stub native Open/Save dialogs, verify IPC options/cancellation, and reject native message dialogs and JavaScript dialogs. Twenty-three scenarios passed, including the new key-details drawer, rename, private export, invalid edits and combined host credentials. Forms/drawer inspected in light/dark themes. Windows installer and packaged smoke launch passed.
- Implementation and additional validation: [Keychain and WinSCP](keychain-winscp.md).


## Unified error handling (2026-10-13)

See [error-handling.md](error-handling.md). Missing keys, failed authentication, networking, file permissions, sync and update failures now have typed codes and themed recovery notices. Twenty-five Electron scenarios and thirteen browser checks passed, including error notification recovery and non-destructive handling of corrupt local vault data.
