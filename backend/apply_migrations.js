const fs = require('fs');
const path = require('path');
const db = require('./src/db');

async function run() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log('Running', file);
    try {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await db.query(sql);
      console.log('Success', file);
    } catch(e) {
      console.log('Failed', file, e.message);
    }
  }
  process.exit(0);
}
run().catch(console.error);
