const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distRoot = path.join(__dirname, '..', 'dist');
const outputPath = path.join(distRoot, 'build-hash.json');

// Hash the whole dist tree so any source change ends up in the hash.
// Excludes build-hash.json itself (the file we're about to write) so the
// hash is stable across rebuilds with the same source.
function collectDistFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...collectDistFiles(full));
        } else if (entry.isFile() && full !== outputPath) {
            out.push(full);
        }
    }
    return out;
}

let buildHash = 'dev';
const files = collectDistFiles(distRoot)
    .map(f => path.relative(distRoot, f).replace(/\\/g, '/'))
    .sort();
if (files.length > 0) {
    const hash = crypto.createHash('md5');
    for (const rel of files) {
        hash.update(rel);
        hash.update('\0');
        hash.update(fs.readFileSync(path.join(distRoot, rel)));
        hash.update('\0');
    }
    buildHash = hash.digest('hex').slice(0, 8);
}

let gitSha = 'unknown';
try {
    gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (err) {
    gitSha = 'unknown';
}

const info = {
    buildHash,
    gitSha,
    buildTime: new Date().toISOString(),
};

fs.writeFileSync(outputPath, JSON.stringify(info, null, 2));
console.log(info);
