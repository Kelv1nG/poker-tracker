const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const resources = [...manifest.background.scripts, manifest.browser_action.default_popup, manifest.browser_action.default_icon, ...Object.values(manifest.icons)];
for (const resource of resources) assert.ok(fs.existsSync(path.join(root, resource)), `Missing manifest resource: ${resource}`);
assert.ok(!manifest.permissions.includes('<all_urls>'), 'The extension should be limited to Bet88');
let parsed = 0;
function inspect(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) inspect(filename);
    else if (filename.endsWith('.js')) { new vm.Script(fs.readFileSync(filename, 'utf8'), { filename }); parsed++; }
    else if (filename.endsWith('.html')) {
      const html = fs.readFileSync(filename, 'utf8');
      for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        assert.ok(!/^[a-z]+:/i.test(match[1]), `Remote resources are not expected: ${match[1]}`);
        assert.ok(fs.existsSync(path.join(path.dirname(filename), match[1])), `Missing HTML resource: ${match[1]}`);
      }
    }
  }
}
inspect(root);
console.log(`Checked ${parsed} JavaScript files; manifest and popup resources are valid.`);
