const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

// Check CLI arguments
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

/**
 * Parse a strict semantic version string into numeric components.
 *
 * @param {string} v Version string to parse.
 * @returns {[number, number, number] | null} Parsed components, or null when invalid.
 */
function parseSemver(v) {
  if (!v) return null;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Determine whether the current version is newer than the base version.
 *
 * @param {string} baseVer Version from the base branch.
 * @param {string} curVer Version from the current checkout.
 * @returns {boolean} True when the current version is greater than the base version.
 */
function isVersionBumped(baseVer, curVer) {
  const b = parseSemver(baseVer);
  const c = parseSemver(curVer);
  if (!b || !c) return false;
  if (c[0] > b[0]) return true;
  if (c[0] === b[0] && c[1] > b[1]) return true;
  if (c[0] === b[0] && c[1] === b[1] && c[2] > b[2]) return true;
  return false;
}

/**
 * Determine whether a changed file is included in the packaged extension.
 *
 * @param {string} filepath Repository-relative file path.
 * @returns {boolean} True when the file requires a version bump.
 */
function isVsixRelevant(filepath) {
  const normalized = filepath.replace(/\\/g, '/');
  const ignoredPrefixes = [
    '.vscode/',
    '.vscode-test/',
    '.github/',
    '.jules/',
    'docs/',
    'scripts/',
  ];
  const ignoredFiles = new Set([
    '.gitignore',
    '.pre-commit-config.yaml',
    '.pre-commit-ci.yaml',
    '.vscode-test.mjs',
    'esbuild.js',
    'tsconfig.json',
    'eslint.config.mjs',
    'vsc-extension-quickstart.md',
  ]);

  if (ignoredFiles.has(normalized)) return false;
  for (const prefix of ignoredPrefixes) {
    if (normalized.startsWith(prefix)) return false;
  }
  return true;
}

// 5. Version bump check (--check-bump)
if (checkBump) {
  console.log('Checking if version bump is required...');
  try {
    let baseRef = null;
    let baseRefName = '';

    const candidates = ['origin/main', 'main', 'origin/master', 'master'];
    for (const cand of candidates) {
      try {
        execSync(`git rev-parse --verify ${cand}`, { stdio: 'ignore' });
        baseRef = cand;
        baseRefName = cand;
        break;
      } catch (e) {
        // continue
      }
    }

    if (!baseRef) {
      errors.push('Could not determine base git ref (origin/main, main, etc.). Cannot verify whether a version bump is required.');
    } else {
      let basePkgContent = null;
      try {
        basePkgContent = execSync(`git show ${baseRef}:package.json`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      } catch (e) {
        // package.json might not exist in baseRef or git error
      }

      if (basePkgContent) {
        const basePkg = JSON.parse(basePkgContent);
        const baseVersion = basePkg.version;

        // Get diff files compared to baseRef
        const diffOutput = execSync(`git diff --name-only ${baseRef}`, { encoding: 'utf8' }).trim();
        const untrackedOutput = execSync('git ls-files -o --exclude-standard', { encoding: 'utf8' }).trim();

        const diffFiles = diffOutput ? diffOutput.split('\n') : [];
        const untrackedFiles = untrackedOutput ? untrackedOutput.split('\n') : [];
        const allChangedFiles = Array.from(new Set([...diffFiles, ...untrackedFiles].filter(Boolean)));

        const vsixChangedFiles = allChangedFiles.filter(isVsixRelevant);

        if (vsixChangedFiles.length > 0) {
          if (!isVersionBumped(baseVersion, version)) {
            errors.push(
              `VSIX-relevant files have been modified compared to ${baseRefName} (base: v${baseVersion}, current: v${version}), but package.json version was not bumped.\n` +
              `    Modified VSIX files:\n` +
              vsixChangedFiles.map(f => `      - ${f}`).join('\n') + '\n' +
              `    Please run "npm run update-version <new_version>" to increment version (minor for feature additions, patch for bug fixes/updates).`
            );
          }
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to execute git diff check (${err.message}). Cannot verify whether a version bump is required.`);
  }
}

if (errors.length > 0) {
  console.error('\nVersion check FAILED:');
  errors.forEach(err => console.error(`  - ${err}`));
  process.exit(1);
}

console.log('Version check PASSED successfully!');
