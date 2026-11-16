import fs from 'node:fs';
import site from './docs.config.json';
const manifest=JSON.parse(fs.readFileSync('../frontend/public/docs/config.json','utf8'));
const messages=Object.fromEntries(site.locales.map(locale=>[locale,JSON.parse(fs.readFileSync(`../frontend/src/i18n/locales/${locale}/docs.json`,'utf8'))]));
const labels=messages['zh-TW'];
export default {...site,navigation:manifest.sections.map((section:{id:string;title?:string;icon?:string;items:string[]})=>({title:section.title||labels.nav.sections[section.id]||section.id,labels:Object.fromEntries(site.locales.map(locale=>[locale,messages[locale].nav.sections[section.id]||section.id])),icon:section.icon,items:section.items}))};
