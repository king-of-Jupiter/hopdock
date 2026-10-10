/** Minimal consistent icon set: 1.5px stroke, currentColor, 16px viewBox. */
function base(path: React.ReactNode) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

export const Icons = {
  hosts: () => base(<><rect x="1.5" y="1.5" width="5" height="5" rx="1" /><rect x="9.5" y="1.5" width="5" height="5" rx="1" /><rect x="1.5" y="9.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /></>),
  key: () => base(<><circle cx="5" cy="8" r="3" /><path d="M8 8h6M12 8v3M14.5 8v2" /></>),
  swap: () => base(<><path d="M2 5.5h9M8.5 3L11 5.5 8.5 8" /><path d="M14 10.5H5M7.5 8L5 10.5 7.5 13" /></>),
  code: () => base(<><path d="M5.5 5L2.5 8l3 3" /><path d="M10.5 5l3 3-3 3" /></>),
  target: () => base(<><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></>),
  clock: () => base(<><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></>),
  gear: () => base(<><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" /></>),
  search: () => base(<><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14.5 14.5" /></>),
  plus: () => base(<><path d="M8 3v10M3 8h10" /></>),
};
