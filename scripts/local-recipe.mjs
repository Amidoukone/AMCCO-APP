// Isolated local recipe. Never reads or writes a remote database.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localEnv = dotenv.parse(await readFile(resolve(root, "backend/.env")));
const source = new URL(localEnv.DATABASE_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(source.hostname)) throw new Error("Une base MySQL locale est obligatoire.");
const sourceName = source.pathname.slice(1);
const recipeName = process.env.AMCCO_RECIPE_DATABASE ?? "amcco_recette_20261117";
if (!/^[a-zA-Z0-9_]+$/.test(sourceName) || !/^amcco_recette_[a-z0-9_]+$/.test(recipeName) || recipeName === sourceName) {
  throw new Error("Nom de base de recette invalide ou identique à la source.");
}
const target = new URL(source);
target.pathname = `/${recipeName}`;
const email = "recette.admin@amcco.local";
const password = process.env.AMCCO_RECIPE_PASSWORD ?? "RecetteLocale2026!";
const action = process.argv[2];
if (!["prepare", "serve", "dev"].includes(action)) throw new Error("Utilisation : node scripts/local-recipe.mjs prepare|serve|dev");

if (action === "prepare") {
  const connection = await mysql.createConnection(source.toString());
  try {
    const [existing] = await connection.execute("SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME = ?", [recipeName]);
    if (existing.length) throw new Error("La base de recette existe déjà. Elle ne sera pas écrasée. Utilisez serve ou un autre AMCCO_RECIPE_DATABASE.");
    const bin = process.env.AMCCO_MYSQL_BIN ?? "C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin";
    const { stdout: dump } = await promisify(execFile)(resolve(bin, process.platform === "win32" ? "mysqldump.exe" : "mysqldump"), [
      `--host=${source.hostname}`, `--port=${source.port || "3306"}`, `--user=${decodeURIComponent(source.username)}`,
      "--single-transaction", "--skip-lock-tables", "--skip-add-drop-table", "--no-tablespaces", "--set-gtid-purged=OFF", "--column-statistics=0", sourceName
    ], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(source.password) }, maxBuffer: 64 * 1024 * 1024 });
    // No --databases: the dump must not choose or create its own schema.
    if (/^\s*(USE\s|CREATE\s+DATABASE\s)/im.test(dump)) throw new Error("Le dump contient une sélection de base non autorisée.");
    await connection.query(`CREATE DATABASE \`${recipeName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    const recipe = await mysql.createConnection({ uri: target.toString(), multipleStatements: true });
    try {
      await recipe.query(dump);
      const [before] = await recipe.query("SELECT status, COUNT(*) AS total FROM transactions GROUP BY status");
      const migration = await readFile(resolve(root, "backend/sql/029_simplify_transaction_lifecycle.sql"), "utf8");
      if (/^\s*USE\s/im.test(migration)) throw new Error("La migration ne doit pas sélectionner une autre base.");
      await recipe.query(migration);
      const userId = randomUUID();
      await recipe.execute("INSERT INTO users (id,email,password_hash,full_name,is_active) VALUES (?,?,?,'Administrateur recette locale',1)", [userId, email, await bcrypt.hash(password, 10)]);
      const [companies] = await recipe.query("SELECT id FROM companies WHERE is_active = 1");
      if (!companies.length) throw new Error("La copie ne contient aucune entreprise active.");
      for (const company of companies) {
        await recipe.execute("INSERT INTO memberships (id,user_id,company_id,role) VALUES (?,?,?,'SYS_ADMIN')", [randomUUID(), userId, company.id]);
      }
      const [after] = await recipe.query("SELECT status, COUNT(*) AS total FROM transactions GROUP BY status");
      console.log(JSON.stringify({ recipeDatabase: recipeName, sourceDatabasePreserved: sourceName, migratedLocalCopyOnly: true, before, after, companies: companies.length }));
      console.log(`Compte local : ${email}\nMot de passe : ${password}`);
    } finally { await recipe.end(); }
  } finally { await connection.end(); }
} else {
  const recipe = await mysql.createConnection(target.toString());
  try {
    const [users] = await recipe.execute("SELECT id FROM users WHERE email = ? AND is_active = 1", [email]);
    if (users.length !== 1) throw new Error("La copie de recette doit d'abord être préparée.");
  } finally { await recipe.end(); }
  const serverArgs = action === "dev"
    ? [fileURLToPath(import.meta.resolve("tsx/cli")), "watch", "src/server.ts"]
    : ["dist/server.js"];
  const server = spawn(process.execPath, serverArgs, {
    cwd: resolve(root, "backend"), stdio: "inherit", windowsHide: true,
    env: {
      ...process.env, ...localEnv, DATABASE_URL: target.toString(), NODE_ENV: "development", PORT: "4000", DB_SSL: "false",
      CORS_ORIGIN: "http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5175",
      JWT_ACCESS_SECRET: randomBytes(32).toString("hex"), JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
      IMAGEKIT_PUBLIC_KEY: "", IMAGEKIT_PRIVATE_KEY: "", IMAGEKIT_URL_ENDPOINT: ""
    }
  });
  console.log(`API locale : http://localhost:4000/api/v1 — base ${recipeName}`);
  server.on("exit", (code) => { process.exitCode = code ?? 1; });
  server.on("error", () => { console.error("Impossible de lancer le backend de recette."); process.exitCode = 1; });
}
