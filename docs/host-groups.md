# Host groups

The arrow beside New host opens a New group action. Group names are trimmed and duplicate names reuse the existing group. The form opens as a right drawer.

Host creation and editing have a Group field with No group, existing groups and an inline New group action. A new host opened inside a group starts with that group selected. While an inline group is unfinished, saving the host is disabled; creating or cancelling that group preserves the other host fields. Hosts are no longer assigned to the first group automatically. Existing API callers that omit groupId preserve the group when editing; new hosts without groupId are ungrouped.

New groups receive unique IDs and update timestamps. Incremental vault sync now uploads groups created after initial migration and preserves newer local group metadata when pulling older remote records.

Validation: 27 Electron scenarios, 19 browser checks, 9 sync unit checks, typecheck and production build passed. The added Electron scenario covers menu creation, inline creation, preselection, no-group assignment, persistence and duplicate names using an isolated profile and local SSH server. A browser check covers pending inline-group validation. Sync restoration is verified through the test transport; live account data was not modified.
