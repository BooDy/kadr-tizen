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

// Ensure kadr-logo.png is present in dist
const logoSrc = path.resolve('public/kadr-logo.png');
const logoDist = path.join(distDir, 'kadr-logo.png');
if (!fs.existsSync(logoDist) && fs.existsSync(logoSrc)) {
  fs.copyFileSync(logoSrc, logoDist);
}

console.log('Packaging into kadr.wgt...');
if (fs.existsSync(outWgt)) {
  fs.unlinkSync(outWgt);
}

const tizenBin = '/home/boody/tizen-studio/tools/ide/bin/tizen';
let packaged = false;

if (fs.existsSync(tizenBin)) {
  try {
    console.log('Signing and packaging with Tizen Studio CLI (profile: kadr)...');
    execSync(`${tizenBin} package -t wgt -s kadr -- "${distDir}"`, { stdio: 'inherit' });
    const signedWgt = path.join(distDir, 'Kadr.wgt');
    if (fs.existsSync(signedWgt)) {
      fs.copyFileSync(signedWgt, outWgt);
      packaged = true;
    }
  } catch (e) {
    console.warn('Tizen CLI signing failed, falling back to standard zip package:', e.message);
  }
}

if (!packaged) {
  try {
    execSync(`cd dist && zip -r "${outWgt}" .`, { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to create wgt zip archive:', err.message);
    process.exit(1);
  }
}

const stats = fs.statSync(outWgt);
console.log(`\n Successfully created ${outWgt} (${(stats.size / 1024).toFixed(1)} KB)`);
