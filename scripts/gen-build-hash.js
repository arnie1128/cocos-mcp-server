const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mainPath = path.join(__dirname, '..', 'dist', 'main.js');
const outputPath = path.join(__dirname, '..', 'dist', 'build-hash.json');

let buildHash = 'dev';
if (fs.existsSync(mainPath)) {
    const content = fs.readFileSync(mainPath);
    buildHash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
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
