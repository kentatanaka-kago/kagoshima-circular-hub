const TZ = 'Asia/Tokyo';

export function formatDateJST(iso: string | null, style: 'short' | 'long' = 'short'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return style === 'long'
    ? d.toLocaleDateString('ja-JP', {
        timeZone: TZ,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : d.toLocaleDateString('ja-JP', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
}

// Returns YYYY-MM-DD for the given iso interpreted in Asia/Tokyo.
// Used to compare "same calendar day" regardless of server TZ.
export function ymdJST(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function isPublishedToday(iso: string | null): boolean {
  const d = ymdJST(iso);
  return d !== null && d === ymdJST(new Date().toISOString());
}
