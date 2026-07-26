import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.resolve(__dirname, '../build');
const basePath = process.env.BASE_PATH || '';

console.log(`[fix-gh-pages] Processing build directory: ${buildDir}`);
console.log(`[fix-gh-pages] BASE_PATH: "${basePath}"`);

if (!fs.existsSync(buildDir)) {
  console.error(`[fix-gh-pages] Error: build directory does not exist at ${buildDir}`);
  process.exit(1);
}

// 1. Create .nojekyll
fs.writeFileSync(path.join(buildDir, '.nojekyll'), '');
console.log('[fix-gh-pages] Created .nojekyll');

// 2. Copy index.html -> 404.html
const indexPath = path.join(buildDir, 'index.html');
const fallbackPath = path.join(buildDir, '404.html');
if (fs.existsSync(indexPath)) {
  fs.copyFileSync(indexPath, fallbackPath);
  console.log('[fix-gh-pages] Created 404.html from index.html');
}

// 3. Fix manifest.webmanifest paths if base is defined
const manifestPath = path.join(buildDir, 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    const prefix = basePath ? basePath : '';
    manifest.start_url = prefix ? `${prefix}/` : '/';
    manifest.scope = prefix ? `${prefix}/` : '/';

    if (Array.isArray(manifest.icons)) {
      manifest.icons = manifest.icons.map((icon) => {
        if (icon.src && icon.src.startsWith('/') && prefix) {
          return { ...icon, src: `${prefix}${icon.src}` };
        }
        return icon;
      });
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('[fix-gh-pages] Updated manifest.webmanifest paths');
  } catch (err) {
    console.error('[fix-gh-pages] Error updating manifest:', err);
  }
}
