const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.cache'];

function generateTree(dirPath, prefix = '') {
  let treeStr = '';
  let entries = [];
  
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    return treeStr;
  }

  // Sort: directories first, then files
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  // Filter out ignored directories
  entries = entries.filter(entry => {
    if (entry.isDirectory() && IGNORE_DIRS.includes(entry.name)) {
      return false;
    }
    return true;
  });

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    
    treeStr += `${prefix}${connector}${entry.name}\n`;

    if (entry.isDirectory()) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      treeStr += generateTree(path.join(dirPath, entry.name), newPrefix);
    }
  });

  return treeStr;
}

const rootDir = path.resolve(__dirname, '..');
const treeOutput = `clinicplus/\n${generateTree(rootDir)}`;

fs.writeFileSync(path.join(rootDir, 'docs', 'directory_tree.txt'), treeOutput, 'utf8');
console.log('Directory tree successfully updated at docs/directory_tree.txt');
