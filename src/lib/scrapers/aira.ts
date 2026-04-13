import { createMunicipalityRssScraper } from './municipality-rss';

export const airaScraper = createMunicipalityRssScraper({
  id: '46225',
  name: '姶良市',
  rssUrl: 'https://www.city.aira.lg.jp/shinchaku.xml',
});
