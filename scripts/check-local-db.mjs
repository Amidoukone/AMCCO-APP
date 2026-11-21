// Read-only local diagnostic. Does not import the server or bootstrap schemas.
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

let connection;
try {
  const settings = dotenv.parse(await readFile(new URL("../backend/.env", import.meta.url)));
  const source = new URL(process.env.DATABASE_URL ?? settings.DATABASE_URL);
  if (source.protocol !== "mysql:" || !["127.0.0.1", "localhost", "[::1]"].includes(source.hostname)) {
    throw Object.assign(new Error(), { code: "LOCAL_DATABASE_REQUIRED" });
  }
  // Match backend configuration precedence and avoid printing credentials.
  console.log(`Vérification MySQL : ${source.hostname}:${source.port || "3306"}${source.pathname}`);
  connection = await mysql.createConnection({ uri: source.href, connectTimeout: 5000 });
  const [[result]] = await connection.query("SELECT DATABASE() AS name, VERSION() AS version");
  console.log(`Connexion réussie — base ${result.name}, MySQL ${result.version}. Aucune donnée modifiée.`);
} catch (error) {
  const hints = {
    LOCAL_DATABASE_REQUIRED: "Ce diagnostic accepte uniquement une base MySQL locale. Aucune connexion effectuée.",
    ECONNREFUSED: "MySQL est arrêté ou n'écoute pas au port configuré. Dans Laragon : MySQL > Start, puis relancer cette commande.",
    ETIMEDOUT: "MySQL ne répond pas. Vérifier son démarrage et le port dans Laragon.",
    ER_ACCESS_DENIED_ERROR: "MySQL répond mais refuse les identifiants. Vérifier DATABASE_URL dans backend/.env (ou sa surcharge dans le terminal).",
    ER_BAD_DB_ERROR: "MySQL répond mais la base configurée n'existe pas. Vérifier le nom de base avant toute initialisation.",
    ENOENT: "Le fichier backend/.env est absent. Le créer à partir de backend/.env.example et configurer la base locale."
  };
  // Driver messages can contain connection details; print only known diagnostics.
  const message = hints[error.code] ?? (error instanceof TypeError
    ? "DATABASE_URL est absente ou invalide. Vérifier backend/.env et les variables du terminal."
    : "Diagnostic impossible. Vérifier la configuration et les journaux MySQL locaux.");
  console.error(message);
  process.exitCode = 1;
} finally {
  await connection?.end();
}
