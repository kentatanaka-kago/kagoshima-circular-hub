import { createMunicipalityRssScraper } from './municipality-rss';

export const kagoshimaCityScraper = createMunicipalityRssScraper({
  id: '46201',
  name: '鹿児島市',
  rssUrl: 'https://www.city.kagoshima.lg.jp/shinchaku/shinchaku.xml',
});
