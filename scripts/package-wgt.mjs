// scripts/package-wgt.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const distDir = path.resolve('dist');
const configXml = path.resolve('config.xml');
const iconSrc = path.resolve('public/icon.png');
const outWgt = path.resolve('kadr.wgt');

const skipBuild = process.argv.includes('--no-build');

if (!skipBuild || !fs.existsSync(distDir)) {
  console.log('Building web bundle...');
  execSync('npm run build', { stdio: 'inherit' });
}

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist after build.');
  process.exit(1);
}

// Copy config.xml into dist for packaging
if (fs.existsSync(configXml)) {
  fs.copyFileSync(configXml, path.join(distDir, 'config.xml'));
} else {
  console.error('Error: config.xml not found in root directory.');
  process.exit(1);
}

// Ensure icon.png is present in dist
const iconDist = path.join(distDir, 'icon.png');
if (!fs.existsSync(iconDist) && fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDist);
}

console.log('Packaging into kadr.wgt...');
if (fs.existsSync(outWgt)) {
  fs.unlinkSync(outWgt);
}

try {
  execSync(`cd dist && zip -r "${outWgt}" .`, { stdio: 'inherit' });
  const stats = fs.statSync(outWgt);
  console.log(`\n Successfully created ${outWgt} (${(stats.size / 1024).toFixed(1)} KB)`);
} catch (err) {
  console.error('Failed to create wgt zip archive:', err.message);
  process.exit(1);
}
