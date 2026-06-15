import Database from 'better-sqlite3'
const db = new Database('prisma/dev.db')

// S1 (semana 19: May 5-7) → verde (avg ~91)
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.93, '9595b5f4c3092efcc3500063')  // May 5
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.91, 'd403b882bfdb0e4199d4bd9f')  // May 6
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.90, '3461ab3dcd2de164ed150903')  // May 7

// S2 (semana 20: May 8-14) → rojo (avg ~53)
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.48, 'a8e8b5ddd1c70ecc5531d7bc')  // May 8
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.52, 'ea7eba4c86f34c00810c3616')  // May 12
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.60, 'dc2b9cfa60eed8a670a4e099')  // May 13

// S3 (semana 21: May 19-21) → amarillo (avg ~75)
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.72, 'b5c26e6c049d783642a06942')  // May 19
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.78, 'bff74473fd30846740819efd')  // May 20
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.74, 'fca614f41e326dbdbde6a893')  // May 21

// S4 (semana 22: May 26-27) → verde (avg ~91)
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.95, 'f4b943ae5d15e2b25c5f00ae')  // May 26
db.prepare("UPDATE Session SET icoScore = ? WHERE id = ?").run(0.88, 'fb1eaba5ff4214049004d21d')  // May 27

// Verificar
const rows = db.prepare("SELECT id, date, icoScore FROM Session WHERE date LIKE '2026-05%' ORDER BY date").all()
console.log(JSON.stringify(rows, null, 2))
db.close()
