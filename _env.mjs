import fs from 'fs';
for (const l of fs.readFileSync('.env','utf8').split('\n')) { const m=/^([A-Z_]+)=(.*)$/.exec(l); if(m) process.env[m[1]]=m[2].replace(/^"|"$/g,''); }
