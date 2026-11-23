// scripts/package-wgt.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const distDir = path.resolve('dist');
const configXml = path.resolve('config.xml');
const iconSrc = path.resolve('public/icon.png');
const logoSrc = path.resolve('public/kadr-logo.png');
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

if (!fs.existsSync(configXml)) {
  console.error('Error: config.xml not found in root directory.');
  process.exit(1);
}

function populateStagingDir(dir) {
  fs.cpSync(distDir, dir, { recursive: true });
  fs.copyFileSync(configXml, path.join(dir, 'config.xml'));

  const iconDist = path.join(dir, 'icon.png');
  if (!fs.existsSync(iconDist) && fs.existsSync(iconSrc)) {
    fs.copyFileSync(iconSrc, iconDist);
  }

  const logoDist = path.join(dir, 'kadr-logo.png');
  if (!fs.existsSync(logoDist) && fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, logoDist);
  }
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
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kadr-wgt-'));
let packaged = false;

try {
  populateStagingDir(stagingDir);

  if (fs.existsSync(tizenBin)) {
    try {
      console.log(`Signing and packaging with Tizen Studio CLI (profile: ${securityProfile})...`);
      const signedWgt = path.join(stagingDir, 'Kadr.wgt');
      if (fs.existsSync(signedWgt)) {
        fs.unlinkSync(signedWgt);
      }
      execFileSync(tizenBin, ['package', '-t', 'wgt', '-s', securityProfile, '--', stagingDir], {
        stdio: 'inherit',
      });
      if (fs.existsSync(signedWgt)) {
        fs.copyFileSync(signedWgt, outWgt);
        packaged = true;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('Tizen CLI signing failed, falling back to standard zip package:', message);
    }
  }

  if (!packaged) {
    // Re-populate a clean staging dir in case Tizen CLI left partial signing artifacts
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    populateStagingDir(stagingDir);
    try {
      execFileSync('zip', ['-r', outWgt, '.'], { cwd: stagingDir, stdio: 'inherit' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fs.rmSync(stagingDir, { recursive: true, force: true });
      console.error('Failed to create wgt zip archive:', message);
      process.exit(1);
    }
  }
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

const wgtBuffer = fs.readFileSync(outWgt);
const sha256 = createHash('sha256').update(wgtBuffer).digest('hex');
fs.writeFileSync(outSha256, `${sha256}  ${path.basename(outWgt)}\n`, 'utf8');

const stats = fs.statSync(outWgt);
console.log(`\n Successfully created ${outWgt} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(` SHA-256: ${sha256} (${outSha256})`);
