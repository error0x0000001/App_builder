#!/usr/bin/env node
/**
 * Packs the open-source Dokploy template blueprints (MIT, github.com/Dokploy/templates) into one JSON file the API loads,
 * and copies their logos (rasters shrunk to 96px WebP) into frontend/public/template-logos.
 * Usage: node tools/templates/import.cjs /path/to/templates-checkout
 */
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const src = path.join(process.argv[2] ?? '', 'blueprints');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'backend/src/modules/deployments/templates/data.json');
const logos = path.join(root, 'frontend/public/template-logos');
fs.mkdirSync(logos, { recursive: true });
const items = [];
/** Upstream descriptions end with a sentence advertising the original product; ours say nothing about it. */
const clean = (text) => text.replace(/\s*(Self-host it|Deploy it|Run it)[^.]*\bDokploy\b[^.]*\./gi, '').replace(/\s*Deploy(?:s|ing)? [^.]*\bwith Dokploy\b[^.]*\./gi, '').replace(/\s{2,}/g, ' ').trim();
for (const id of fs.readdirSync(src).sort()) {
  const dir = path.join(src, id);
  if (!fs.statSync(dir).isDirectory()) continue;
  let meta; try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { continue; }
  if (!fs.existsSync(path.join(dir, 'docker-compose.yml')) || !fs.existsSync(path.join(dir, 'template.toml'))) continue;
  let logo = null;
  const file = meta.logo && path.join(dir, meta.logo);
  if (file && fs.existsSync(file)) {
    const ext = path.extname(file).toLowerCase();
    try {
      if (ext === '.svg') { logo = `${id}.svg`; fs.copyFileSync(file, path.join(logos, logo)); }
      else { logo = `${id}.webp`; execFileSync('convert', [`${file}[0]`, '-background', 'none', '-resize', '96x96>', '-quality', '82', path.join(logos, logo)]); }
    } catch { logo = null; }
  }
  items.push({
    id, name: meta.name, version: meta.version ?? '', description: clean(meta.description ?? ''), logo, tags: meta.tags ?? [], links: meta.links ?? {},
    compose: fs.readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), toml: fs.readFileSync(path.join(dir, 'template.toml'), 'utf8'),
  });
}
fs.writeFileSync(out, JSON.stringify(items));
console.log(`${items.length} templates, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB data`);
