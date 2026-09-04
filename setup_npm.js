import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function installNpm() {
  const npmDir = path.join(__dirname, 'tools', 'npm');
  if (fs.existsSync(path.join(npmDir, 'bin', 'npm-cli.js'))) {
    console.log('npm already installed at', npmDir);
    return;
  }

  fs.mkdirSync(path.join(__dirname, 'tools'), { recursive: true });
  console.log('Fetching npm metadata...');
  const res = await fetch('https://registry.npmjs.org/npm/latest');
  const data = await res.json();
  const tarballUrl = data.dist.tarball;
  console.log('Downloading npm from', tarballUrl);

  const tgzRes = await fetch(tarballUrl);
  const arrayBuffer = await tgzRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const tgzPath = path.join(__dirname, 'tools', 'npm.tgz');
  fs.writeFileSync(tgzPath, buffer);

  console.log('Extracting tarball...');
  execSync(`tar -xzf "${tgzPath}" -C "${path.join(__dirname, 'tools')}"`, { stdio: 'inherit' });
  
  const extractedPath = path.join(__dirname, 'tools', 'package');
  if (fs.existsSync(extractedPath)) {
    if (fs.existsSync(npmDir)) {
      fs.rmSync(npmDir, { recursive: true, force: true });
    }
    fs.renameSync(extractedPath, npmDir);
  }
  
  if (fs.existsSync(tgzPath)) {
    fs.unlinkSync(tgzPath);
  }

  console.log('npm installed successfully into tools/npm!');
}

installNpm().catch(err => {
  console.error('Failed to setup npm:', err);
  process.exit(1);
});
