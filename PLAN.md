# Клон Termius — план MVP (соло, вайбкод)

> Рабочее название: **Hopdock** (запасной фаворит, проверено — чисто в поиске; переименование проекта одной командой позже).

## Цель
Полный клон интерфейса Termius (desktop), затем свои фичи. Без браузерной версии. Mobile — позже через React Native на том же TS-коре.

## Стек (фиксирован)
- Desktop: `Electron + React + TypeScript + xterm.js + ssh2 + Zustand + TanStack Virtual + shadcn/Tailwind`
- Синк: `Supabase (Postgres + Auth + Realtime + Storage)` — бэка своего нет
- Крипто MVP: `TLS + libsodium (sealed box для секретов)`; полноценное E2E — итерация 5
- Репо новое, форк Termorator — только референс (модели, импортер Termius, ppk-экспорт, SFTP-очередь)

## Что клонируем (порядок Termius)
1. AppShell + Sidebar (Hosts/Keychain/Snippets/History, Vaults, Sync-статус, Search Cmd+K, New)
2. HostList + HostForm (группы вложенные, теги, user@host:port, latency, контекстное меню)
3. TerminalTabs + xterm (connect/disconnect/reconnect, сплит, Cmd+T/F/E)
4. SFTP drawer (remote-панель, drag-drop, очередь 6 задач, прогресс)
5. Keychain (CRUD RSA/EC/Ed25519, fingerprint, ssh-copy-id, генерация, ppk-экспорт)
6. Snippets (группы, переменные $var, run on N hosts)
7. Sync + Settings + History

## Структура репо
```
apps/desktop (Electron main + renderer)
packages/core (модели Host/Key/Snippet/Vault, vault-шифрование, sync-движок) — без React, переиспользуется в RN
packages/ssh (обертки ssh2: connect, exec, sftp, jump-host, agent)
packages/ui (токены, AppShell, HostList, TerminalTabs, SftpDrawer, Palette, EmptyState)
supabase/ (схема: vaults, hosts, keys_refs, snippets, devices)
```

## Модель Host (минимум)
`id, vaultId, parentId, name, host, port=22, username, auth{type: password|key|agent|cert, keyId?, passwordRef?}, proxy/jump{hostId?}, portForwards[], startupSnippetId?, tags[], remark, sort, updatedAt, deletedAt`

## Итерации (вертикальные срезы, хобби-скоуп)
- **M0 Каркас (3-5 дней):** AppShell + Sidebar + HostList на моках + HostForm + токены light/dark. Проверка: рядом с Termius не отличить список.
- **M1 Терминал (1-2 нед):** ssh2 connect через main, xterm fit/search/serialize, reconnect, сплит. Проверка: 3 таба + обрыв сети → reconnect.
- **M2 SFTP (1 нед):** ls/put/get/rm/mkdir, очередь 6, прогресс в строке. Проверка: папка 500 файлов туда-обратно.
- **M3 Ключи+Сниппеты + их синк (обязательно, 1-2 нед):** Keychain CRUD (RSA/EC/Ed25519, fingerprint, ssh-copy-id, генерация, ppk-экспорт) + Snippets CRUD (группы, $var, run on N hosts) + синк через Supabase: `personal vault` + `shared vault` для друзей по инвайту, пуш/пул по `updatedAt`, секреты только E2E-блобами + OS keychain. Проверка: ключ и сниппет, созданные на desktop, появляются на втором девайсе.
- **M4 Синк остального (по желанию):** хосты/настройки/история в те же волты.

## Правила чтобы не стало «уродски»
- Цвета только через CSS vars (`tokens.css`), никаких hex в компонентах
- Шрифты: UI Inter 13/14, моно JetBrains Mono 13/lh 1.5; bold только заголовки секций
- Тени 2 шт (card/popover), радиусы 8/12, шаг 4px, иконки Lucide 16/18
- Пустые состояния и skeleton на каждый список с первого дня

## Риски соло
- Объем: весь Termius ~6-9 мес одному; режем до M0-M2 как MVP
- Секреты: ключи/пароли только в OS keychain (Electron safeStorage), никогда в plaintext в Supabase
- Scope-freeze: пока M1 не коннектится — новые экраны не начинаем

## Следующий шаг
Scaffold `apps/desktop + packages/core,ui,ssh` на Electron+React+TS, перенести токены и Host-модель, M0 на моках.
