const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'out', '.next', '.astro',
  '.svelte-kit', 'coverage', 'tmp', '.husky', '.bun'
]);

const INCLUDED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.mdx', '.css', '.scss', 
  '.html', '.yml', '.yaml', '.toml', '.mjs', '.cjs'
]);

// Special files that don't have extensions but we want to process
const INCLUDED_FILES = new Set([
  'impactr', 'impactr', 'Dockerfile', '.gitignore', '.npmignore', '.eslintignore'
]);

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (EXCLUDED_DIRS.has(f)) continue;
    
    const dirPath = path.join(dir, f);
    let stat;
    try {
      stat = fs.statSync(dirPath);
    } catch (e) {
      continue;
    }
    
    if (stat.isDirectory()) {
      walkDir(dirPath, callback);
    } else {
      const ext = path.extname(f);
      if (INCLUDED_EXTS.has(ext) || INCLUDED_FILES.has(f)) {
        callback(dirPath);
      }
    }
  }
}

let modifiedFiles = 0;

walkDir(process.cwd(), (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    let newContent = content
      .replace(/opencode-gitlab-auth/g, 'opencode-gitlab-auth')
      .replace(/opencode-poe-auth/g, 'opencode-poe-auth')
      .replace(/Opencode-gitlab-auth/g, 'Opencode-gitlab-auth')
      .replace(/Opencode-poe-auth/g, 'Opencode-poe-auth');
      
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      modifiedFiles++;
    }
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err.message);
  }
});

console.log(`Successfully reverted auth packages in ${modifiedFiles} files.`);
