import { createMunicipalityRssScraper } from './municipality-rss';

export const makurazakiScraper = createMunicipalityRssScraper({
  id: '46204',
  name: '枕崎市',
  rssUrl: 'https://www.city.makurazaki.lg.jp/rss/10/list1.xml',
});
