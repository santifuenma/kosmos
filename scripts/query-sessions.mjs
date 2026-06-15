import Database from 'better-sqlite3'
const db = new Database('prisma/dev.db')
const rows = db.prepare("SELECT id, date, icoScore FROM Session WHERE date LIKE '2026-05%' ORDER BY date").all()
console.log(JSON.stringify(rows, null, 2))
db.close()
