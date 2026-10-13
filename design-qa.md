# Hopdock design QA

final result: passed

## Visual truth and capture

- Selected light reference: `docs/design/reference-light.png` (generated result exec-43d8f09f-2e0b-4f2d-a848-7aeb9fb35653).
- Selected dark reference: `docs/design/reference-dark.png` (generated result exec-0e4d6f43-2fa0-42ef-a176-183032bec23a).
- Browser-rendered implementation: `docs/design/hosts-light.png`, `docs/design/hosts-dark.png`.
- CSS viewport: 1794 x 877, browser capture 1794 x 877 pixels, density 1. Source: 1793 x 877 pixels. Comparison crops the implementation's rightmost 1px; no scaling or stretching.
- State: Hosts library, grouped-host hiding disabled, Vaults active, web-02 and SFTP tabs open. Existing application fixture data retained (4 groups / 12 hosts, versus mockup's synthetic 3 / 30).
- Full comparison evidence: `docs/design/comparison-light.png`, `docs/design/comparison-dark.png`, opened and inspected side by side.
- Focused evidence: `docs/design/detail-light.png`, `docs/design/detail-dark.png`, inspected at original size to assess sidebar, type hierarchy, group and host icons, first card, borders, search and tabs.

## Findings and required fidelity surfaces

No remaining actionable P0/P1/P2 findings.

- Typography: locally packaged Source Serif 4 for wordmark/section headings, Source Sans 3 for practical UI and host names. Cyrillic included. Confirmed computed families in browser. Serif navigation in the generated image intentionally becomes readable sans navigation, following the agreed serif-heading/sans-UI pairing. 27px headings, 14px host names, 12px metadata; ellipsis prevents long names breaking tracks.
- Layout: compact 60px host cards, 40px OS tiles, 12px grid gaps, five columns at wide desktop sizes. Group summary row above independent Hosts grid. 240px sidebar and 66px session bar closely follow the selected image's proportions. Native 900 x 760 viewport checked: two-column cards, scrolling main content, persistent sidebar/theme controls, no horizontal document overflow.
- Colors: ivory/mushroom/olive light theme and warm charcoal/cream/sage dark theme. Group tints retained. Native controls use matching color-scheme. Text, borders, hover and focus states remain legible.
- Assets: real Simple Icons OS logos and Tabler library icons. Every group uses a folder. No screenshot used as an interactive screen or placeholder asset. Existing device/OS metadata determines the correct logo, rather than the mockup's repeated synthetic Ubuntu logos.
- Content: application host names/counts/usernames retained. Primary New host action opens the existing form. Mock-only toolbar Terminal launcher and group edit menus are omitted because the application has no standalone terminal/group-management actions; actual terminal and SFTP actions are in each host's menu. Settings is the working route for preferences. Footer reports existing version/sync status.

## Comparison and repair history

1. First rendered light/dark comparison established matching palette, density and hierarchy. Existing 12-host dataset produces more whitespace than the 30-host source; accepted as data-driven behavior.
2. Interaction check found newly introduced ellipsis menu immediately closing from the opening click bubbling to the window listener. Fixed propagation; verified terminal/SFTP/edit actions become visible and usable. Added Escape dismissal.
3. Keyboard check identified inherited non-keyboard-operable session close span. Converted to a separate labeled button; Enter successfully closes the session.
4. Dark comparison identified light native checkbox chrome. Added theme-specific color-scheme, rebuilt and recaptured both themes.
5. Final full and focused comparisons inspected after repairs. No actionable P0/P1/P2 visual findings remain.

## Validation

- `npm run typecheck`: passed.
- Electron production build: passed.
- `git diff --check`: passed (only platform line-ending notices).
- In-app browser: host search (one match and no-match state), group opening (four Production hosts), return to library, hide grouped hosts (all fixtures are grouped, hence empty general list), show-all recovery, persistence of theme and hiding across reload, mirrored Settings preference, host action menus, Escape dismissal, keyboard session close, terminal connection and SFTP browsing with mocked bridge, Keychain and Snippets views, New host form.
- Final fresh browser tab console: no errors or warnings.
- Real remote SSH, OS keychain and sync writes not exercised: browser preview uses the repository's existing mock harness. Main/preload production bundles build successfully.

## Follow-up polish

- Resolved: the user selected Lora for the more pronounced serif in headings and wordmark. Source Sans 3 remains for functional UI.

## Lora iteration (2026-10-11)

- User-authorized typography override: bundled Lora regular, Latin and Cyrillic, replaces Source Serif 4 in display tokens. Old dependency removed.
- Latest captures: `docs/design/hosts-lora-light.png`, `docs/design/hosts-lora-dark.png` (light: 1254 x 828; dark: 1794 x 877). Settings, counts and layout unchanged; fresh capture has only Vaults open.
- Focused same-size before/after comparisons: `docs/design/lora-comparison-light.png`, `docs/design/lora-comparison-dark.png` (700 x 450 source regions side by side). Both opened and inspected; headings/wordmark retain intended rhythm and do not overflow.
- Computed font verified as Lora in browser for headings and wordmark. Light/dark rendering inspected; no console errors or warnings. Production build passed. No new actionable P0/P1/P2 findings; final result remains passed.

## Implementation checklist

## Working-tool refinement (2026-10-11)

- User authorized a scoped refinement of the existing app: remove slogan and arbitrary pastel group colors, retain Lora only in the brand, use functional sans headings, soften card borders and expose connection addresses. These changes intentionally override the original visual target for those surfaces.
- Latest captures: `docs/design/hosts-work-light.png`, `docs/design/hosts-work-dark.png`, 1212 x 714 capture pixels. These responsive captures differ in viewport from the original reference; full comparison canvases are not normalized fidelity evidence. Same 4 groups/12 hosts, hiding disabled. Only Vaults tab open; older baseline captures also have session/SFTP tabs, an interaction-state difference outside edited content.
- Comparison evidence: `docs/design/work-comparison-light.png`, `docs/design/work-comparison-dark.png`; focused group/heading/card crops in `docs/design/work-detail-light.png`, `docs/design/work-detail-dark.png`. Inspected both themes and focused regions.
- Typography: 17px semibold Source Sans 3 section headings, Lora wordmark only, monospace connection addresses with truncation/full tooltip. Palette: unchanged theme foundations; all groups now use the same neutral surface and folder icon. Layout: 60px host cards retained, groups compacted to 64px; decorative borders become transparent until hover/focus. Assets unchanged; no raster asset substitution. Copy: slogan removed; username, host and non-default port visible in host subtitle.
- Checked address search (1 matching host), hide-grouped behavior and opening Production (4 hosts), theme toggle, computed fonts, document overflow and console. No warnings/errors. Final production build passed; diff check passed. No actionable P0/P1/P2 findings. final result: passed.

- [x] Light and dark design tokens and bundled typography.
- [x] Compact host grid and consistent group folders.
- [x] Persistent hide-grouped preference in Hosts and Settings.
- [x] Independent group navigation and filtered search.
- [x] Visual comparison, interaction checks and build validation.

## Build identity (2026-10-11)

- Footer reads hopdock 0.0.6 · b59e07b in the running preview. Version comes from the desktop package; commit is embedded from Git at build time, with CI fallback.
- Browser footer text verified; no console errors or warnings. Production renderer and preload contain the updated build identity. Diff check passed.


## Keychain and Snippets sync (2026-10-11)

- Keychain now sends encrypted private key material and passphrases; Snippets sends encrypted names, folders, scripts and variables. Both support timestamp-based merge, migration and deletion tombstones.
- Seven sync tests passed, including two-device restoration to real local files and signing with a restored RSA private key. Typecheck, production build and diff check passed. Live Supabase authentication was not exercised.
- Settings copy updated to describe all synchronized contents. No browser console warnings or errors during preview inspection.


## Build-time Supabase configuration (2026-10-12)

- URL and public publishable key embedded into the main bundle. IPC accepts only account credentials. Editable URL/key fields removed from Settings. Local dotenv is ignored; GitHub build/release workflows consume repository variables, which were set and read back successfully.
- Nine tests, typecheck, production build and diff check passed. Bundle checked for the supplied project config. Preview shows account/encryption fields without URL/key inputs; no console warnings/errors.
- Live anonymous Auth settings request returned HTTP 200. The vault_items query returned HTTP 404/PGRST205: the table is not visible to the Data API yet. CLI-generated config and initial migration are prepared locally; migration has not been applied or pushed in this task.


## Native functional verification (2026-10-12)

- Full report: docs/functional-test-report.md; machine-readable results: docs/functional-test-results.json. Twenty native Electron scenarios passed with isolated profiles, real loopback SSH/SFTP and a test SSH agent; actual Supabase SDK tested against a local HTTP fixture with two-device restoration and real SSH authentication.
- Native preload ESM/sandbox failure, unsupported text prompts, SFTP reconnection/home/copy issues, host key selection, Windows/protected key import, connection cleanup, Supabase WebSocket compatibility and updater error handling repaired.
- SSH checks, nine sync/config tests, ten browser smoke checks, typecheck, production build and diff check passed. Windows installer built; packaged module-load smoke exited 0.
- Live Supabase vault_items remains unavailable (HTTP 404/PGRST205). Certificate authentication is explicitly unsupported; production update installation and other OS packages are not claimed tested.
