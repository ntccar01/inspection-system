import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  html: path.join(root, "web", "index.html"),
  css: path.join(root, "web", "styles.css"),
  js: path.join(root, "web", "app.js")
};

const requiredHtml = [
  '<section class="view active" id="dashboard">',
  '<section class="view" id="booking">',
  '<section class="view" id="vehicles">',
  '<section class="view" id="reminders">',
  '<section class="view" id="settings">',
  '<script src="app.js"></script>'
];

const requiredJs = [
  "localStorage",
  "getInspectionRule",
  "renderMetrics",
  "renderCapacityForm",
  "addEventListener"
];

const suspiciousSecretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][^"']{8,}["']/i
];

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${path.relative(root, file)}`);
  }
  return fs.readFileSync(file, "utf8");
}

const html = read(files.html);
const css = read(files.css);
const js = read(files.js);

const failures = [];

for (const marker of requiredHtml) {
  if (!html.includes(marker)) failures.push(`HTML missing marker: ${marker}`);
}

for (const marker of requiredJs) {
  if (!js.includes(marker)) failures.push(`JS missing marker: ${marker}`);
}

if (!css.includes(".app-shell") || !css.includes("@media")) {
  failures.push("CSS missing layout or responsive rules");
}

for (const [name, content] of Object.entries({ html, css, js })) {
  for (const pattern of suspiciousSecretPatterns) {
    if (pattern.test(content)) {
      failures.push(`${name} contains a suspicious secret-like value`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  files: Object.keys(files).length,
  views: (html.match(/<section class="view/g) || []).length,
  navTabs: (html.match(/class="nav-tab/g) || []).length,
  cssBytes: Buffer.byteLength(css),
  jsBytes: Buffer.byteLength(js)
}, null, 2));
