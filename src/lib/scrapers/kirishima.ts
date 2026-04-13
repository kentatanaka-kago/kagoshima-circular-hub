import { createMunicipalityRssScraper } from './municipality-rss';

export const kirishimaScraper = createMunicipalityRssScraper({
  id: '46218',
  name: '霧島市',
  rssUrl: 'https://www.city-kirishima.jp/shinchaku.xml',
});
