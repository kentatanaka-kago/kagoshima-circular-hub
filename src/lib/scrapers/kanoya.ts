import { createMunicipalityRssScraper } from './municipality-rss';

export const kanoyaScraper = createMunicipalityRssScraper({
  id: '46203',
  name: '鹿屋市',
  rssUrl: 'https://www.city.kanoya.lg.jp/oshirase.xml',
});
