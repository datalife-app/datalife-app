/* ============================================
   DataLife — Utilitários
   ============================================ */

// Ícones: Lucide (https://lucide.dev, licença ISC)
const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  sofa: '<path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"/><path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z"/><path d="M4 18v2"/><path d="M20 18v2"/><path d="M12 4v9"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  wine: '<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>',
  trending: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  cap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  skip: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  umbrella: '<path d="M22 12a10.06 10.06 1 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  minus: '<path d="M5 12h14"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  calendarClock: '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  dumbbell: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  cigarette: '<path d="M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14"/><path d="M18 8c0-2.5-2-2.5-2-5"/><path d="M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M22 8c0-2.5-2-2.5-2-5"/><path d="M7 12v4"/>',
  dice: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>',
  cookie: '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  listChecks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 11.994 2z"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'
};

export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// faixa: [mín, máx] recomendados (%) · inclui/porque: nota exibida ao definir a meta ·
// exemplo: sugestão no campo Descrição do lançamento ·
// corte: prioridade para reduzir quando a soma passa de 100% (1 = cortar primeiro).
//   Custos fixos por último: aluguel e contas não caem de um mês para o outro.
// cor: tokens --cat-N do tema (rampa clara -> escura); a ordem do gráfico segue esta lista.
export const CATEGORIAS = [
  {
    id: 'custosFixos', nome: 'Custos fixos', cor: 'var(--cat-1)', icon: 'home', meta: 30, faixa: [0, 40], corte: 6, exemplo: 'Aluguel',
    inclui: 'Aluguel ou financiamento, condomínio, contas de casa, mercado, transporte, saúde.',
    porque: 'No máximo 40%: acima disso o risco de descontrole é enorme, e qualquer imprevisto vira dívida.'
  },
  {
    id: 'conforto', nome: 'Conforto', cor: 'var(--cat-2)', icon: 'sofa', meta: 15, faixa: [0, 15], corte: 1, exemplo: 'Delivery',
    inclui: 'O que vai além do necessário: carro mais caro do que precisa, delivery, app de transporte, assinaturas.',
    porque: 'Deixa a rotina mais leve, e é o primeiro lugar para cortar num mês apertado.'
  },
  {
    id: 'metas', nome: 'Metas', cor: 'var(--cat-3)', icon: 'target', meta: 15, faixa: [10, 25], corte: 2, exemplo: 'Viagem de fim de ano',
    inclui: 'Viagens, presentes de fim de ano, troca de carro, reserva de emergência.',
    porque: 'Um percentual fixo faz seus objetivos avançarem todo mês. Guarde onde resgata na hora, mas rende mais que a poupança. Se aumentar Prazeres, diminua aqui.'
  },
  {
    id: 'prazeres', nome: 'Prazeres', cor: 'var(--cat-4)', icon: 'wine', meta: 10, faixa: [5, 10], corte: 4, exemplo: 'Churrasco com os amigos',
    inclui: 'Cerveja, churrasco, refrigerante, restaurantes, passeios, hobbies.',
    porque: 'Até 10%: lazer planejado não pesa na consciência e, com as metas, mantém a qualidade de vida. Não tire daqui para aumentar outras partes.'
  },
  {
    id: 'liberdade', nome: 'Liberdade financeira', cor: 'var(--cat-5)', icon: 'trending', meta: 25, faixa: [15, 100], corte: 5, exemplo: 'Aporte no Tesouro Direto',
    inclui: 'Investimentos de longo prazo, previdência, aposentadoria.',
    porque: '25% por 4 anos garante 1 ano do seu eu do futuro. Não tire daqui para aumentar outras partes; quanto mais, melhor.'
  },
  {
    id: 'conhecimento', nome: 'Conhecimento', cor: 'var(--cat-6)', icon: 'cap', meta: 5, faixa: [3, 100], corte: 3, exemplo: 'Curso de inglês',
    inclui: 'Cursos, livros, certificações, idiomas.',
    porque: 'Investir em você tende a aumentar sua renda, e isso melhora todas as outras metas. Não há teto.'
  }
];

/**
 * Sugere cortes para a soma das metas voltar a 100%.
 * 1º: o que está acima do máximo recomendado; 2º: categorias mais flexíveis até o mínimo
 * recomendado (ordem `corte`); por último, abaixo do mínimo, na mesma ordem.
 * @returns {Array<{cat:Object, de:number, para:number}>}
 */
export function sugerirCortes(metas) {
  let excesso = CATEGORIAS.reduce((a, c) => a + (metas[c.id] || 0), 0) - 100;
  if (excesso <= 0) return [];
  const novo = { ...metas };

  // 1º: o que passou do máximo recomendado volta ao máximo
  for (const c of [...CATEGORIAS].sort((a, b) => a.corte - b.corte)) {
    const d = Math.min(Math.max(novo[c.id] - c.faixa[1], 0), excesso);
    novo[c.id] -= d;
    excesso -= d;
  }

  // 2º e 3º: rodízio de 1% dentro de cada grupo de flexibilidade, primeiro até o mínimo
  // recomendado, depois até 0. Distribui o corte em vez de zerar uma categoria só.
  // Grupos: conforto e metas · conhecimento, prazeres e liberdade · custos fixos
  // (prazeres e liberdade ficam por último entre os flexíveis: não se corta deles para aumentar o resto)
  const grupos = [[1, 2], [3, 4, 5], [6]].map(g => CATEGORIAS.filter(c => g.includes(c.corte)));
  for (const piso of [c => c.faixa[0], () => 0]) {
    for (const grupo of grupos) {
      let cortou = true;
      while (excesso > 0 && cortou) {
        cortou = false;
        for (const c of grupo.sort((a, b) => a.corte - b.corte)) {
          if (excesso > 0 && novo[c.id] > piso(c)) {
            novo[c.id]--;
            excesso--;
            cortou = true;
          }
        }
      }
    }
  }
  return CATEGORIAS.filter(c => novo[c.id] !== metas[c.id]).map(c => ({ cat: c, de: metas[c.id], para: novo[c.id] }));
}

/** "até 40%" | "entre 5% e 15%" | "pelo menos 15%" */
export function faixaLabel([min, max]) {
  if (min === 0) return `até ${max}%`;
  if (max >= 100) return `pelo menos ${min}%`;
  return `entre ${min}% e ${max}%`;
}

export function defaultMetas() {
  return Object.fromEntries(CATEGORIAS.map(c => [c.id, c.meta]));
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Teto de valores: R$ 10 bilhões (bem abaixo de Number.MAX_SAFE_INTEGER). */
export const MAX_CENTS = 1_000_000_000_000;

/* ---------- Modo privacidade ----------
   Preferência por dispositivo (localStorage). Com ele ativo, todo valor em R$
   passa a ser exibido mascarado; as páginas re-renderizam no evento 'datalife:privacy'. */
/* O app se chamava DataRenda: chaves "datarenda:*" deste navegador viram "datalife:*"
   (privacidade, pomodoro em andamento, vista dos Livros e dados do modo local). */
try {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('datarenda:')) continue;
    const novo = 'datalife:' + k.slice('datarenda:'.length);
    if (localStorage.getItem(novo) === null) localStorage.setItem(novo, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
} catch { /* storage indisponível */ }

const PRIVACY_KEY = 'datalife:privacy';
let privacy = false;
try { privacy = localStorage.getItem(PRIVACY_KEY) === '1'; } catch { /* storage indisponível */ }
document.documentElement.classList.toggle('privacy', privacy);

export const MASK = 'R$ ••••';
export const isPrivate = () => privacy;

export function setPrivacy(on) {
  privacy = !!on;
  try { localStorage.setItem(PRIVACY_KEY, privacy ? '1' : '0'); } catch { /* ok */ }
  document.documentElement.classList.toggle('privacy', privacy);
  window.dispatchEvent(new CustomEvent('datalife:privacy', { detail: privacy }));
}

/** Botão de olho que alterna o modo privacidade. */
export function bindPrivacyToggle(btn) {
  const paint = () => {
    btn.innerHTML = icon(privacy ? 'eyeOff' : 'eye');
    btn.setAttribute('aria-pressed', privacy);
    btn.title = privacy ? 'Mostrar valores' : 'Ocultar valores';
    btn.setAttribute('aria-label', btn.title);
  };
  paint();
  btn.addEventListener('click', () => { setPrivacy(!privacy); paint(); });
}

/**
 * Teclado em todos os grupos role="radiogroup" do app (padrão ARIA):
 * - ←/→/↑/↓ focam a opção vizinha e a escolhem com um clique, então cada tela
 *   reaproveita a lógica de clique que já tem;
 * - só a opção marcada fica no Tab (ou a primeira, se nenhuma estiver marcada).
 * Chamado uma vez por initPagina; vale para grupos criados depois (delegação + observador).
 */
export function initSetasRadio() {
  const ativos = g => [...g.querySelectorAll('[role="radio"]')].filter(b => !b.disabled && b.offsetParent !== null);
  const ajustarTab = g => {
    const ops = [...g.querySelectorAll('[role="radio"]')];
    const marcada = ops.find(b => b.getAttribute('aria-checked') === 'true') || ops[0];
    ops.forEach(b => { b.tabIndex = b === marcada ? 0 : -1; });
  };
  document.addEventListener('keydown', e => {
    const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const atual = e.target.closest?.('[role="radio"]');
    const grupo = atual?.closest('[role="radiogroup"]');
    if (!passo || !grupo || e.altKey || e.ctrlKey || e.metaKey) return;
    const ops = ativos(grupo);
    const i = ops.indexOf(atual);
    if (i < 0 || ops.length < 2) return;
    e.preventDefault();
    const prox = ops[(i + passo + ops.length) % ops.length];
    prox.focus();
    prox.click();
  });
  // Mantém o Tab na opção marcada quando a marcação muda ou um grupo novo aparece
  const pendentes = new Set();
  let agendado = false;
  const agendar = g => {
    pendentes.add(g);
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => { pendentes.forEach(ajustarTab); pendentes.clear(); agendado = false; });
  };
  new MutationObserver(muts => {
    for (const m of muts) {
      const alvo = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (m.type === 'attributes') { const g = alvo?.closest('[role="radiogroup"]'); if (g) agendar(g); continue; }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const g = n.closest('[role="radiogroup"]');
        if (g) agendar(g);
        n.querySelectorAll?.('[role="radiogroup"]').forEach(agendar);
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
  document.querySelectorAll('[role="radiogroup"]').forEach(ajustarTab);
}

/** @param {number} cents */
export const formatBRL = cents => (privacy ? MASK : BRL.format((cents || 0) / 100));

/** Formata sem máscara (inputs em edição, exportação). */
export const formatBRLRaw = cents => BRL.format((cents || 0) / 100);

/** "R$ 1.234,56" | "1234,56" -> 123456 */
export function parseBRL(text) {
  const digits = String(text).replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
  return digits ? Math.min(parseInt(digits, 10), MAX_CENTS) : 0;
}

/** Máscara de moeda para inputs: digita-se da direita para a esquerda. */
export function bindCurrencyInput(input, onChange) {
  input.addEventListener('input', () => {
    const cents = parseBRL(input.value);
    input.value = cents ? formatBRLRaw(cents) : '';
    onChange?.(cents);
  });
}

const PCT = [0, 1, 2].map(d => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

/** 12.5 -> "12,50%" */
export const formatPct = (n, digits = 2) => `${PCT[digits].format(Number.isFinite(n) ? n : 0)}%`;

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Date -> "2026-03" */
export const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** "2026-03" -> "Março/2026" */
export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** Date -> "2026-03-14" (hora local) */
export const dayKey = d => `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-03-14" -> Date (meia-noite local) */
export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key, delta) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

/** "2026-03-14" -> "14/03" */
export const formatDay = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

/** Debounce com .flush(): executa já a chamada pendente (ex.: antes de trocar de mês ou fechar a aba). */
export function debounce(fn, ms = 600) {
  let t, pending = null;
  const run = () => {
    clearTimeout(t);
    if (!pending) return;
    const args = pending;
    pending = null;
    return fn(...args);
  };
  const debounced = (...args) => {
    pending = args;
    clearTimeout(t);
    t = setTimeout(run, ms);
  };
  debounced.flush = run;
  return debounced;
}

/** crypto.randomUUID só existe em contexto seguro (HTTPS/localhost); fallback para HTTP na rede local. */
export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * @param {string} message
 * @param {'success'|'error'} type
 * @param {number} duration
 * @param {{label:string, onClick:()=>void}} [action] botão no toast (ex.: Desfazer)
 */
export function showToast(message, type = 'success', duration = 3000, action) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 150);
  };
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismiss(); action.onClick(); });
    toast.append(btn);
  }
  document.body.appendChild(toast); // entrada via @starting-style
  // Pausa o timer enquanto o mouse está em cima (dá tempo de clicar em Desfazer)
  const start = () => { timer = setTimeout(dismiss, duration); };
  toast.addEventListener('pointerenter', () => clearTimeout(timer));
  toast.addEventListener('pointerleave', start);
  start();
}

/**
 * Posiciona um popover `position: fixed` em coordenadas da janela.
 * Dentro de um <dialog> com transform (animação de abertura), o "fixed" passa a
 * contar a partir do dialog: desconta a posição dele para o popover não deslocar.
 */
export function placeFixed(pop, left, top) {
  const host = pop.parentElement?.closest('dialog');
  let x = 0, y = 0;
  if (host && getComputedStyle(host).transform !== 'none') {
    const r = host.getBoundingClientRect();
    x = r.left + host.clientLeft;
    y = r.top + host.clientTop;
  }
  pop.style.left = `${left - x}px`;
  pop.style.top = `${top - y}px`;
}

/**
 * Letreiro: texto que não cabe na largura desliza devagar até o fim e volta,
 * para ser lido inteiro. Só anima o que de fato transborda; com "reduzir
 * movimento" no sistema, fica parado (o title continua mostrando tudo).
 * Uso: <span class="letreiro"><span>texto</span></span> dentro de um bloco estreito.
 */
export function letreiros(root = document) {
  for (const el of root.querySelectorAll('.letreiro')) {
    const txt = el.firstElementChild;
    if (!txt) continue;
    const sobra = txt.scrollWidth - el.clientWidth;
    el.classList.toggle('is-andando', sobra > 2);
    if (sobra > 2) {
      el.style.setProperty('--letreiro-x', `${-sobra}px`);
      // ~30 px/s, com pausas nas pontas (no keyframe)
      el.style.setProperty('--letreiro-t', `${Math.max(4, sobra / 30 + 3).toFixed(1)}s`);
    }
  }
}

/** Baixa um arquivo gerado no navegador. */
export function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- App instalável (PWA) ---------- */

/** Registra o service worker (offline e instalação). Silencioso se não houver suporte. */
export function registrarSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const go = () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(e => console.warn('Service worker:', e));
  // Páginas esperam o login antes de chegar aqui: o "load" pode já ter passado
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
