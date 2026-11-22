// scripts/package-wgt.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const distDir = path.resolve('dist');
const configXml = path.resolve('config.xml');
const iconSrc = path.resolve('public/icon.png');
const outWgt = path.resolve('kadr.wgt');
const outSha256 = `${outWgt}.sha256`;

const skipBuild = process.argv.includes('--no-build');

if (!skipBuild || !fs.existsSync(distDir)) {
  console.log('Building web bundle...');
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
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
if (fs.existsSync(outSha256)) {
  fs.unlinkSync(outSha256);
}

const tizenBin = process.env.TIZEN_CLI_BIN || '/home/boody/tizen-studio/tools/ide/bin/tizen';
const securityProfile = process.env.TIZEN_SECURITY_PROFILE || 'kadr';
let packaged = false;

if (fs.existsSync(tizenBin)) {
  try {
    console.log(`Signing and packaging with Tizen Studio CLI (profile: ${securityProfile})...`);
    const signedWgt = path.join(distDir, 'Kadr.wgt');
    if (fs.existsSync(signedWgt)) {
      fs.unlinkSync(signedWgt);
    }
    execFileSync(tizenBin, ['package', '-t', 'wgt', '-s', securityProfile, '--', distDir], {
      stdio: 'inherit',
    });
    if (fs.existsSync(signedWgt)) {
      fs.copyFileSync(signedWgt, outWgt);
      fs.unlinkSync(signedWgt);
      packaged = true;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn('Tizen CLI signing failed, falling back to standard zip package:', message);
  }
}

if (!packaged) {
  try {
    execFileSync('zip', ['-r', outWgt, '.'], { cwd: distDir, stdio: 'inherit' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to create wgt zip archive:', message);
    process.exit(1);
  }
}

const wgtBuffer = fs.readFileSync(outWgt);
const sha256 = createHash('sha256').update(wgtBuffer).digest('hex');
fs.writeFileSync(outSha256, `${sha256}  ${path.basename(outWgt)}\n`, 'utf8');

const stats = fs.statSync(outWgt);
console.log(`\n Successfully created ${outWgt} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(` SHA-256: ${sha256} (${outSha256})`);
