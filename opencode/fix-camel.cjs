const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'build', 'out', '.next', '.astro',
  '.svelte-kit', 'coverage', 'tmp', '.husky', '.bun'
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
      callback(dirPath);
    }
  }
}

let modifiedFiles = 0;

walkDir(process.cwd(), (filePath) => {
  try {
    // Only process text files by reading first few bytes? 
    // Or just try/catch utf8 read and skip if it contains null bytes.
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.indexOf('\0') !== -1) return; // skip binary files

    let newContent = content
      .replace(/Impactr/g, 'Impactr')
      .replace(/impactr/g, 'impactr')
      .replace(/Impactr/g, 'Impactr')
      .replace(/IMPACTR/g, 'IMPACTR');
      
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      modifiedFiles++;
    }
  } catch (err) {
    // skip
  }
});

console.log(`Successfully updated ${modifiedFiles} files with remaining references.`);
