import fs from 'node:fs';
import path from 'node:path';
import {source} from '../app/source.server';
const root=path.resolve('../frontend/public');
fs.rmSync('public',{recursive:true,force:true});
fs.mkdirSync('public/docs',{recursive:true});
for(const directory of ['docs/images','brand'])if(fs.existsSync(path.join(root,directory)))fs.cpSync(path.join(root,directory),path.join('public',directory),{recursive:true});
for(const page of source.pages()){
 const file=path.join(root,'docs',page.contentLocale,page.slug+'.md');
 const out=path.join('public/docs',page.contentLocale,page.slug+'.md');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(file,out);
}
fs.copyFileSync('../frontend/pages/docs-worker.js','public/_worker.js');
