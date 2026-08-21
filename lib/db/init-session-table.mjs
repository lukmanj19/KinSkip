// Creates the connect-pg-simple session table. The API bundles connect-pg-simple
// with esbuild, which breaks its runtime table.sql lookup (table.sql isn't in the
// bundle output dir), so we create the table here as part of DB setup instead.
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
  console.log("session table ready");
} finally {
  await pool.end();
}
