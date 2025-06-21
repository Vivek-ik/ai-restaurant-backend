// const franc =  import('franc');
import {franc} from 'franc';

export const detectLanguage = (text) => {
  const lang = franc(text);
  return lang === 'hin' ? 'hi' : 'en';
};
