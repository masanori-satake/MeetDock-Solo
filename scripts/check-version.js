const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const checkBump = process.argv.includes('--check-bump');

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
  if (!lock.packages || !lock.packages['']) {
    errors.push('package-lock.json packages[""] root package record is missing');
  } else if (lock.packages[''].version !== version) {
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

// Semver comparison helper: returns >0 if v1 > v2, 0 if v1 == v2, <0 if v1 < v2
function compareSemver(v1, v2) {
  const p1 = v1.replace(/^v/i, '').split('.').map(Number);
  const p2 = v2.replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function getGitBaseRef() {
  if (process.env.BASE_BRANCH) return process.env.BASE_BRANCH;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;

  try {
    execSync('git rev-parse --verify origin/main', { stdio: 'ignore' });
    return 'origin/main';
  } catch (e) {
    // origin/main not found
  }

  try {
    execSync('git rev-parse --verify main', { stdio: 'ignore' });
    return 'main';
  } catch (e) {
    // main not found
  }

  try {
    execSync('git rev-parse --verify HEAD~1', { stdio: 'ignore' });
    return 'HEAD~1';
  } catch (e) {
    // HEAD~1 not found
  }

  return null;
}

// 5. Check version bump if --check-bump flag is set
if (checkBump) {
  console.log('Checking version bump against base git reference...');
  const baseRef = getGitBaseRef();
  if (!baseRef) {
    console.warn('Warning: Could not determine git base ref for version bump check. Skipping bump check.');
  } else {
    try {
      const basePkgRaw = execSync(`git show ${baseRef}:package.json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const basePkg = JSON.parse(basePkgRaw);
      const baseVersion = basePkg.version;

      const diffFiles = execSync(`git diff --name-only ${baseRef}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
        .trim()
        .split('\n')
        .filter(Boolean);

      if (diffFiles.length > 0) {
        if (compareSemver(version, baseVersion) <= 0) {
          errors.push(
            `Version bump check FAILED: Code changes detected relative to ${baseRef} (v${baseVersion}), but package.json version (${version}) was not bumped!\n` +
            `  Please run 'npm run update-version <new_version>' before committing or merging.`
          );
        } else {
          console.log(`Version bump check PASSED: Version bumped from v${baseVersion} to v${version}.`);
        }
      } else {
        console.log(`No changes detected compared to ${baseRef} (v${baseVersion}). Version bump check PASSED.`);
      }
    } catch (err) {
      console.warn(`Warning: Failed to check base package.json at ${baseRef}: ${err.message}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Version check FAILED:');
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Version consistency check PASSED successfully!');
