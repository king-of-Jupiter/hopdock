import { IconLayoutGrid, IconKey, IconArrowsExchange, IconBraces, IconTarget, IconClock, IconSettings, IconSearch, IconPlus, IconFolder, IconFile, IconTerminal2, IconDotsVertical, IconX, IconChevronRight, IconArrowLeft, IconSun, IconMoon } from '@tabler/icons-react';
const icon = (Component: typeof IconFolder) => () => <Component size={20} stroke={1.6} aria-hidden="true" />;
export const Icons = {
  hosts: icon(IconLayoutGrid), key: icon(IconKey), swap: icon(IconArrowsExchange), code: icon(IconBraces),
  target: icon(IconTarget), clock: icon(IconClock), gear: icon(IconSettings), search: icon(IconSearch),
  plus: icon(IconPlus), folder: icon(IconFolder), file: icon(IconFile), terminal: icon(IconTerminal2), more: icon(IconDotsVertical),
  close: icon(IconX), chevron: icon(IconChevronRight), back: icon(IconArrowLeft), sun: icon(IconSun), moon: icon(IconMoon),
};
