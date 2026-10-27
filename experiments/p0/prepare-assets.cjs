'use strict';
// Provision browser libraries locally before starting the network-isolated server.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(__dirname,'.local');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'tailwind-input.css'),'@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
const config={content:[root.replaceAll('\\','/')+'/*.html',root.replaceAll('\\','/')+'/*.js'],safelist:[{pattern:/(bg|text|border)-(slate|blue|sky|emerald|green|rose|amber|yellow|gray|red|orange)-(50|100|200|300|400|500|600|700|800|900)/}]};
// RegExp cannot be represented in JSON; reconstruct only this fixed generated expression.
fs.writeFileSync(path.join(out,'tailwind.config.cjs'),`module.exports={content:${JSON.stringify(config.content)},safelist:[{pattern:/(bg|text|border)-(slate|blue|sky|emerald|green|rose|amber|yellow|gray|red|orange)-(50|100|200|300|400|500|600|700|800|900)/}]};\n`);
const result=spawnSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-c',path.join(out,'tailwind.config.cjs'),'-i',path.join(out,'tailwind-input.css'),'-o',path.join(out,'tailwind.css'),'--minify'],{stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
console.log('Offline browser CSS prepared. The staging server never fetches libraries.');
