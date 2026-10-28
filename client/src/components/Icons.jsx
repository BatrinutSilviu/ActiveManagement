const I = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
);

export const IconDashboard = (p) => <I {...p} d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} />;
export const IconCalendar = (p) => <I {...p} d={<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>} />;
export const IconWallet = (p) => <I {...p} d={<><path d="M3 7a2 2 0 0 1 2-2h13v4" /><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="16" cy="13.5" r="1.3" /></>} />;
export const IconReport = (p) => <I {...p} d={<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>} />;
export const IconSettings = (p) => <I {...p} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>} />;
export const IconPlus = (p) => <I {...p} d={<path d="M12 5v14M5 12h14" />} />;
export const IconEdit = (p) => <I {...p} d={<path d="M17 3l4 4L8 20H4v-4L17 3z" />} />;
export const IconTrash = (p) => <I {...p} d={<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />} />;
export const IconX = (p) => <I {...p} d={<path d="M18 6L6 18M6 6l12 12" />} />;
export const IconMenu = (p) => <I {...p} d={<path d="M3 6h18M3 12h18M3 18h18" />} />;
export const IconDownload = (p) => <I {...p} d={<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />} />;
export const IconActivity = (p) => <I {...p} d={<path d="M3 17l5-11 4 8 2-4 4 8" />} />;
export const IconUpload = (p) => <I {...p} d={<path d="M12 15V3M7 8l5-5 5 5M4 21h16" />} />;
export const IconTrend = (p) => <I {...p} d={<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />} />;
export const IconArrowDown = (p) => <I {...p} d={<path d="M12 5v14M5 12l7 7 7-7" />} />;
export const IconArrowUp = (p) => <I {...p} d={<path d="M12 19V5M5 12l7-7 7 7" />} />;
export const IconUsers = (p) => <I {...p} d={<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>} />;
export const IconLogout = (p) => <I {...p} d={<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />} />;
export const IconCheck = (p) => <I {...p} d={<path d="M5 12.5l4.5 4.5L19 7.5" />} />;
export const IconBox = (p) => <I {...p} d={<><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>} />;
export const IconTrophy = (p) => <I {...p} d={<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>} />;
export const IconCoins = (p) => <I {...p} d={<><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>} />;
