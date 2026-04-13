// Runs on a GitHub-hosted runner (Azure egress), where METI does not
// block us. Fetches the press index + body for each CE-relevant article,
// then POSTs the resulting JSON to the Vercel ingest endpoint. The
// Vercel side only needs to insert + summarise — no outbound fetch to
// meti.go.jp happens from Vercel.
import { parseMetiHtml } from '../src/lib/scrapers/meti';
import { fetchArticlePage } from '../src/lib/scrapers/body';
import { fetchText } from '../src/lib/scrapers/common';

const ENDPOINT =
  process.env.INGEST_ENDPOINT ?? 'https://kagoshima-circular-hub.vercel.app/api/ingest/meti';
const SECRET = process.env.INGEST_SECRET;
const BODY_CONCURRENCY = 3;

async function main() {
  if (!SECRET) {
    console.error('INGEST_SECRET env var is required');
    process.exit(1);
  }

  console.log('Fetching METI press index…');
  const indexHtml = await fetchText('https://www.meti.go.jp/press/');
  const items = parseMetiHtml(indexHtml);
  console.log(`Parsed ${items.length} CE-relevant items`);

  const articles: typeof items = [];
  for (let i = 0; i < items.length; i += BODY_CONCURRENCY) {
    const batch = items.slice(i, i + BODY_CONCURRENCY);
    const enriched = await Promise.all(
      batch.map(async (a) => {
        const { body, publishedAt } = await fetchArticlePage(a.source_url);
        return {
          ...a,
          raw_excerpt: body ?? a.raw_excerpt,
          published_at: a.published_at ?? publishedAt,
        };
      }),
    );
    articles.push(...enriched);
  }

  console.log(
    `Enriched ${articles.length} articles ` +
      `(with body: ${articles.filter((a) => a.raw_excerpt).length})`,
  );

  console.log(`POST → ${ENDPOINT}`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ articles }),
  });
  const text = await res.text();
  console.log(`Status ${res.status}`);
  console.log(text);
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
