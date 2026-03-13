const fs = require('fs');
const text = fs.readFileSync('idl_dump.txt', 'utf16le');
const start = text.indexOf('{');
const end = text.lastIndexOf('}');
if (start >= 0 && end >= 0) {
  const json = text.substring(start, end + 1);
  fs.mkdirSync('target/idl', { recursive: true });
  fs.writeFileSync('target/idl/bagscolator.json', json, 'utf8');
  console.log('IDL Written successfully.');
} else {
  console.log('JSON Not found in dump');
}
