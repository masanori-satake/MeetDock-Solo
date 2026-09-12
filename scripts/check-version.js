const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// 1. package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

if (!version) {
  console.error('Error: "version" field is missing in package.json');
  process.exit(1);
}

console.log(`Checking version consistency for v${version}...`);

let errors = [];

// 2. package-lock.json
const lockPath = path.join(rootDir, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.version !== version) {
    errors.push(`package-lock.json root "version" (${lock.version}) does not match package.json version (${version})`);
  }
  if (lock.packages && lock.packages[''] && lock.packages[''].version !== version) {
    errors.push(`package-lock.json packages[""].version (${lock.packages[''].version}) does not match package.json version (${version})`);
  }
} else {
  errors.push('package-lock.json does not exist');
}

// 3. CHANGELOG.md
const changelogPath = path.join(rootDir, 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const changelogHeader = `## [${version}]`;
  if (!changelog.includes(changelogHeader)) {
    errors.push(`CHANGELOG.md does not contain entry header "${changelogHeader}"`);
  }
} else {
  errors.push('CHANGELOG.md does not exist');
}

// 4. README.md
const readmePath = path.join(rootDir, 'README.md');
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (!readme.includes(version)) {
    errors.push(`README.md does not mention version "${version}"`);
  }
} else {
  errors.push('README.md does not exist');
}

if (errors.length > 0) {
  console.error('Version consistency check FAILED:');
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Version consistency check PASSED successfully!');
