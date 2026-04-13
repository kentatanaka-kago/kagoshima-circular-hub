import { createMunicipalityRssScraper } from './municipality-rss';

export const kagoshimaPrefScraper = createMunicipalityRssScraper({
  id: '46000',
  name: '鹿児島県',
  rssUrl: 'https://www.pref.kagoshima.jp/saishin/saishin.xml',
});
