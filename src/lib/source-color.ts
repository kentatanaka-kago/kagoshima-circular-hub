// Per-source colour palette for the little source "chip" on cards and
// filter pills. Municipalities and any future sources share the neutral
// fallback; the three ministries have brand-memorable accents.
export function sourceChipClass(name: string): string {
  switch (name) {
    case '環境省':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case '経済産業省':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';
    case '農林水産省':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    default:
      return 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  }
}
