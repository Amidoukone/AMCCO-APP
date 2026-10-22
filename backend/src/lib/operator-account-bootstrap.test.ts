import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOperatorFinancialAccountsReady } from "./operator-account-bootstrap.js";

const { db } = vi.hoisted(() => ({ db: {
  query: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn()
} }));
vi.mock("./db.js", () => ({ getDbPool: () => ({ getConnection: async () => db }) }));
vi.mock("./logger.js", () => ({ logger: { info: vi.fn() } }));

let companies: Array<{ id: string }>;
let operators: Set<string>;
let accounts: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  companies = [{ id: "company-a" }];
  operators = new Set(["HARDWARE", "HYDROCARBON", "BEVERAGE_DEPOT"]);
  accounts = new Set();
  db.execute.mockReset().mockImplementation(async (sql: string, values: string[]) => {
    if (sql.includes("INSERT INTO financial_accounts")) accounts.add(values[3]);
    return [{}];
  });
  db.query.mockReset().mockImplementation(async (sql: string, values: string[]) => {
    if (sql.includes("SELECT DISTINCT c.id")) return [companies];
    if (sql.includes("FOR UPDATE")) return [[{ id: values[0] }]];
    if (sql.includes("SELECT u.id")) return [operators.has(values[0]) ? [{ id: "operator-1" }] : []];
    if (sql.includes("SELECT fa.id")) return [accounts.has(values[1]) ? [{ id: "existing-account" }] : []];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe("operator financial account deployment repair", () => {
  it("provisions all three operator sectors with zero balances and an audit event", async () => {
    await ensureOperatorFinancialAccountsReady();
    const creates = db.execute.mock.calls.filter(([sql]) => sql.includes("INSERT INTO financial_accounts"));
    expect(creates).toHaveLength(3);
    expect(creates.map(([, values]) => values[3])).toEqual(["HARDWARE", "HYDROCARBON", "BEVERAGE_DEPOT"]);
    for (const [sql, values] of creates) {
      expect(sql).toContain("0, 'DEDICATED'");
      expect(values[1]).toBe("company-a");
    }
    expect(db.execute.mock.calls.filter(([sql]) => sql.includes("INSERT INTO audit_logs"))).toHaveLength(3);
    expect(db.execute.mock.calls.filter(([sql]) => sql.includes("INSERT INTO financial_account_activities"))).toHaveLength(3);
    expect(db.execute.mock.calls.map(([sql]) => sql).join(" ")).not.toMatch(/UPDATE|DELETE|INSERT INTO transactions/);
    expect(db.commit).toHaveBeenCalledOnce();
    expect(db.release).toHaveBeenCalledOnce();
  });

  it("preserves existing sector accounts and creates no duplicates after repeated startup", async () => {
    accounts.add("BEVERAGE_DEPOT");
    await ensureOperatorFinancialAccountsReady();
    const firstWrites = db.execute.mock.calls.length;
    expect(firstWrites).toBe(6);
    await ensureOperatorFinancialAccountsReady();
    expect(db.execute).toHaveBeenCalledTimes(firstWrites);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("NOT EXISTS") && sql.includes("scope_type = 'RESTRICTED'"))).toBe(true);
  });

  it("skips sectors without an active operator and enabled activity", async () => {
    operators = new Set(["HYDROCARBON"]);
    await ensureOperatorFinancialAccountsReady();
    const creates = db.execute.mock.calls.filter(([sql]) => sql.includes("INSERT INTO financial_accounts"));
    expect(creates).toHaveLength(1);
    expect(creates[0][1][3]).toBe("HYDROCARBON");
    expect(db.query.mock.calls.find(([sql]) => sql.includes("SELECT u.id"))?.[0]).toMatch(/u.is_active = 1 AND ca.is_enabled = 1/);
  });

  it("locks the target company before checking account availability", async () => {
    await ensureOperatorFinancialAccountsReady("company-a");
    expect(db.query.mock.calls[0]).toEqual([expect.stringContaining("AND c.id = ?"), ["company-a"]]);
    expect(db.query.mock.calls[1]).toEqual([expect.stringContaining("FOR UPDATE"), ["company-a"]]);
    expect(db.query.mock.calls.findIndex(([sql]) => sql.includes("FOR UPDATE")))
      .toBeLessThan(db.query.mock.calls.findIndex(([sql]) => sql.includes("SELECT fa.id")));
    for (const [, values] of db.query.mock.calls.filter(([sql]) => sql.includes("SELECT fa.id"))) {
      expect(values[0]).toBe("company-a");
    }
  });

  it("rolls back all provisioning when an audit insert fails", async () => {
    db.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO audit_logs")) throw new Error("audit unavailable");
      return [{}];
    });
    await expect(ensureOperatorFinancialAccountsReady()).rejects.toThrow("audit unavailable");
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.rollback).toHaveBeenCalledOnce();
    expect(db.release).toHaveBeenCalledOnce();
  });

  it("does no provisioning for an empty production company list", async () => {
    companies = [];
    await ensureOperatorFinancialAccountsReady();
    expect(db.beginTransaction).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledOnce();
  });
});
