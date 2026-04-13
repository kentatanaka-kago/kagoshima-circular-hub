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
