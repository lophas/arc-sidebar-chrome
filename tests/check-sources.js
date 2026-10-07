import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
let count=0;
function walk(directory) { for(const entry of fs.readdirSync(directory,{withFileTypes:true})) { const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.js')){execFileSync(process.execPath,['--check',file]);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g)){if(!fs.existsSync(path.resolve(path.dirname(file),match[1])))throw Error('Missing import '+file+': '+match[1]);}count++;}} }
walk('src');console.log(`${count} JavaScript files and relative imports checked`);
