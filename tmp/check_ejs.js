const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'views', 'admin', 'orderView.ejs');
const content = fs.readFileSync(filePath, 'utf8');

try {
  ejs.compile(content);
  console.log("EJS compiled successfully!");
} catch (err) {
  console.error("EJS Compilation Error:");
  console.error(err.message);
}
