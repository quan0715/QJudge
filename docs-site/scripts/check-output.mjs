import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('build/client');
const files=fs.readdirSync(root,{recursive:true}).filter(f=>typeof f==='string'&&f.endsWith('index.html')&&f.includes('/docs/'));
const broken=new Set();
for(const file of files){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 if(!html.includes('<h1')||!html.includes('rel="canonical"'))throw new Error(`Missing article metadata: ${file}`);
 for(const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
  if(m[1].startsWith('//'))continue;
  const target=decodeURIComponent(m[1]);let local=path.join(root,target);
  if(fs.existsSync(local)&&fs.statSync(local).isDirectory())local=path.join(local,'index.html');
  if(!fs.existsSync(local))broken.add(`${file}: ${target}`);
 }
}
if(broken.size)throw new Error([...broken].join('\n'));
if(!fs.existsSync(path.join(root,'404.html')))throw new Error('Missing 404.html');
console.log(`${files.length} static article pages: metadata and internal links passed`);
