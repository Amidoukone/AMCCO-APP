import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  addFinanceTransactionProofRequest,
  ApiError,
  createFinanceAccountRequest,
  createFinanceTransactionRequest,
  getFinanceProofUploadAuthRequest,
  listFinanceAccountsRequest,
  listFinanceTransactionProofsRequest,
  listFinanceTransactionsRequest,
  reviewFinanceTransactionRequest,
  submitFinanceTransactionRequest
} from "../lib/api";
import {
  BUSINESS_ACTIVITY_CODES,
  getBusinessActivityLabel,
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { ActivityFieldDefinition } from "../types/activities";
import type {
  FinancialAccount,
  FinancialAccountScopeType,
  FinancialTransaction,
  TransactionProof
} from "../types/finance";
import {
  formatAccountScopeLabel,
  getAccountGovernanceLines,
  getTransactionGovernanceLines
} from "../utils/governanceDisplay";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Operation impossible. Verifie la connexion backend.";
}

function statusLabel(status: FinancialTransaction["status"]): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "SUBMITTED") {
    return "Soumise";
  }
  if (status === "APPROVED") {
    return "Approuvee";
  }
  return "Rejetee";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, previous[field.key] ?? ""]));
}

function formatMetadataSummary(
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): string {
  const items = fields
    .map((field) => {
      const value = metadata[field.key]?.trim();
      return value ? `${field.label}: ${value}` : null;
    })
    .filter((value): value is string => value !== null);

  if (items.length > 0) {
    return items.join(" | ");
  }

  const fallbackItems = Object.entries(metadata)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`);
  return fallbackItems.length > 0 ? fallbackItems.join(" | ") : "-";
}

function buildDefaultAccountForm(
  selectedActivityCode: BusinessActivityCode | null,
  canManageGlobalAccounts: boolean
): {
  name: string;
  accountRef: string;
  openingBalance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | "";
  allowedActivityCodes: BusinessActivityCode[];
} {
  const scopeType: FinancialAccountScopeType = canManageGlobalAccounts
    ? "GLOBAL"
    : selectedActivityCode
      ? "DEDICATED"
      : "RESTRICTED";

  return {
    name: "",
    accountRef: "",
    openingBalance: "0.00",
    scopeType,
    primaryActivityCode: selectedActivityCode ?? "",
    allowedActivityCodes: selectedActivityCode ? [selectedActivityCode] : []
  };
}

function normalizeAccountFormForActivities(
  previous: ReturnType<typeof buildDefaultAccountForm>,
  enabledActivityCodes: BusinessActivityCode[],
  selectedActivityCode: BusinessActivityCode | null
) {
  const nextPrimaryActivityCode =
    previous.primaryActivityCode && enabledActivityCodes.includes(previous.primaryActivityCode)
      ? previous.primaryActivityCode
      : (selectedActivityCode ?? enabledActivityCodes[0] ?? "");
  const nextAllowedActivityCodes = previous.allowedActivityCodes.filter((activityCode) =>
    enabledActivityCodes.includes(activityCode)
  );

  return {
    ...previous,
    primaryActivityCode: nextPrimaryActivityCode,
    allowedActivityCodes:
      nextAllowedActivityCodes.length > 0
        ? nextAllowedActivityCodes
        : selectedActivityCode
          ? [selectedActivityCode]
          : nextAllowedActivityCodes
  };
}

function isAccountVisibleForSelectedActivity(
  account: FinancialAccount,
  activityCode: BusinessActivityCode | null
): boolean {
  if (!activityCode) {
    return true;
  }

  return (
    account.scopeType === "GLOBAL" ||
    account.primaryActivityCode === activityCode ||
    account.allowedActivityCodes.includes(activityCode)
  );
}

export function FinanceTransactionsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, refreshSession, user } = useAuth();
  const {
    enabledActivities,
    isLoading: isLoadingActivities,
    selectedActivity,
    selectedActivityCode,
    selectedProfile,
    setSelectedActivityCode
  } = useBusinessActivity();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreateAccount = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const canManageGlobalAccounts = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canReview = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const canAccessAudit = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const [accountForm, setAccountForm] = useState(() =>
    buildDefaultAccountForm(
      selectedActivityCode,
      user?.role === "OWNER" || user?.role === "SYS_ADMIN"
    )
  );
  const [filters, setFilters] = useState<{
    status: "ALL" | FinancialTransaction["status"];
    type: "ALL" | FinancialTransaction["type"];
  }>({
    status: "ALL",
    type: "ALL"
  });

  const [transactionForm, setTransactionForm] = useState({
    accountId: "",
    type: "CASH_OUT" as "CASH_IN" | "CASH_OUT",
    amount: "",
    currency: "XOF",
    description: "",
    metadata: {} as Record<string, string>,
    occurredAt: new Date().toISOString().slice(0, 16)
  });

  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [proofsByTransaction, setProofsByTransaction] = useState<Record<string, TransactionProof[]>>(
    {}
  );
  const [openProofs, setOpenProofs] = useState<Record<string, boolean>>({});
  const [loadingProofsByTransaction, setLoadingProofsByTransaction] = useState<Record<string, boolean>>(
    {}
  );

  const financeMetadataFields = selectedProfile?.finance.metadataFields ?? [];
  const allowedCurrencies = selectedProfile?.finance.allowedCurrencies ?? ["XOF"];
  const financeWorkflow = selectedProfile?.finance.workflow ?? [];
  const enabledActivityCodes = useMemo(
    () => enabledActivities.map((item) => item.code),
    [enabledActivities]
  );
  const requestedTransactionId = searchParams.get("transactionId");
  const requestedActivityCode = useMemo(() => {
    const activityCode = searchParams.get("activityCode");
    return activityCode && isBusinessActivityCode(activityCode) ? activityCode : null;
  }, [searchParams]);

  const withAuthorizedToken = useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      if (!session?.accessToken) {
        throw new ApiError(401, "Session absente");
      }
      try {
        return await action(session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw new ApiError(401, "Session expiree. Reconnecte-toi.");
        }
        return action(refreshed);
      }
    },
    [refreshSession, session?.accessToken]
  );

  const selectedTransaction = useMemo(
    () => transactions.find((item) => item.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions]
  );

  const handleOpenTransactionDetails = useCallback(
    (transactionId: string, activityCode: BusinessActivityCode | null) => {
      setSelectedTransactionId(transactionId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("transactionId", transactionId);
        if (activityCode) {
          next.set("activityCode", activityCode);
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const handleCloseTransactionDetails = useCallback(() => {
    setSelectedTransactionId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("transactionId");
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (requestedActivityCode && requestedActivityCode !== selectedActivityCode) {
      setSelectedActivityCode(requestedActivityCode);
    }
  }, [requestedActivityCode, selectedActivityCode, setSelectedActivityCode]);

  useEffect(() => {
    if (!requestedTransactionId) {
      setSelectedTransactionId(null);
      return;
    }

    setSelectedTransactionId(requestedTransactionId);
  }, [requestedTransactionId]);

  const loadData = useCallback(async () => {
    if (!selectedActivityCode) {
      setAccounts([]);
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [accountsResp, txResp] = await withAuthorizedToken(async (accessToken) => {
        const [a, t] = await Promise.all([
          listFinanceAccountsRequest(accessToken, {
            activityCode: selectedActivityCode
          }),
          listFinanceTransactionsRequest(accessToken, {
            limit: 100,
            status: filters.status === "ALL" ? undefined : filters.status,
            type: filters.type === "ALL" ? undefined : filters.type,
            activityCode: selectedActivityCode
          })
        ]);
        return [a, t] as const;
      });
      setAccounts(accountsResp.items);
      setTransactions(txResp.items);
      setSelectedTransactionId((prev) => {
        if (requestedTransactionId) {
          return txResp.items.some((item) => item.id === requestedTransactionId)
            ? requestedTransactionId
            : null;
        }
        return txResp.items.some((item) => item.id === prev) ? prev : (txResp.items[0]?.id ?? null);
      });
      const txIds = new Set(txResp.items.map((item) => item.id));
      setProofsByTransaction((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
      );
      setOpenProofs((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
      );
      setLoadingProofsByTransaction((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
      );
      setTransactionForm((prev) => ({
        ...prev,
        accountId:
          accountsResp.items.some((account) => account.id === prev.accountId)
            ? prev.accountId
            : (accountsResp.items[0]?.id ?? "")
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.status,
    filters.type,
    requestedTransactionId,
    selectedActivityCode,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setTransactionForm((prev) => ({
      ...prev,
      currency: allowedCurrencies.includes(prev.currency) ? prev.currency : (allowedCurrencies[0] ?? "XOF"),
      metadata: syncMetadataState(prev.metadata, financeMetadataFields)
    }));
  }, [allowedCurrencies, financeMetadataFields]);

  useEffect(() => {
    setAccountForm((prev) =>
      normalizeAccountFormForActivities(prev, enabledActivityCodes, selectedActivityCode)
    );
  }, [enabledActivityCodes, selectedActivityCode]);

  useEffect(() => {
    if (canManageGlobalAccounts) {
      return;
    }

    setAccountForm((prev) =>
      prev.scopeType === "GLOBAL"
        ? {
            ...buildDefaultAccountForm(selectedActivityCode, false),
            name: prev.name,
            accountRef: prev.accountRef,
            openingBalance: prev.openingBalance
          }
        : prev
    );
  }, [canManageGlobalAccounts, selectedActivityCode]);

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await withAuthorizedToken((accessToken) =>
        createFinanceAccountRequest(accessToken, {
          name: accountForm.name.trim(),
          accountRef: accountForm.accountRef.trim() || undefined,
          openingBalance: accountForm.openingBalance.trim(),
          scopeType: accountForm.scopeType,
          primaryActivityCode:
            accountForm.scopeType === "DEDICATED" && accountForm.primaryActivityCode
              ? accountForm.primaryActivityCode
              : undefined,
          allowedActivityCodes:
            accountForm.scopeType === "RESTRICTED" ? accountForm.allowedActivityCodes : undefined
        })
      );
      setSuccessMessage("Compte financier cree.");
      setAccountForm(buildDefaultAccountForm(selectedActivityCode, canManageGlobalAccounts));
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleCreateTransaction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedActivityCode) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await withAuthorizedToken((accessToken) =>
        createFinanceTransactionRequest(accessToken, {
          accountId: transactionForm.accountId,
          type: transactionForm.type,
          amount: transactionForm.amount.trim(),
          currency: transactionForm.currency.trim().toUpperCase(),
          activityCode: selectedActivityCode as BusinessActivityCode,
          description: transactionForm.description.trim() || undefined,
          metadata: transactionForm.metadata,
          occurredAt: new Date(transactionForm.occurredAt).toISOString()
        })
      );
      setSuccessMessage("Transaction creee en brouillon.");
      setTransactionForm((prev) => ({
        ...prev,
        amount: "",
        description: "",
        metadata: syncMetadataState({}, financeMetadataFields)
      }));
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleAddProof(transactionId: string): Promise<void> {
    const selectedFile = proofFiles[transactionId];
    if (!selectedFile) {
      setErrorMessage("Selectionne un fichier de preuve.");
      return;
    }

    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const proofResponse = await withAuthorizedToken(async (accessToken) => {
        const authResp = await getFinanceProofUploadAuthRequest(accessToken, transactionId);
        const auth = authResp.item;

        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("fileName", selectedFile.name);
        formData.append("useUniqueFileName", "true");
        formData.append("folder", auth.folder);
        formData.append("publicKey", auth.publicKey);
        formData.append("token", auth.token);
        formData.append("signature", auth.signature);
        formData.append("expire", String(auth.expire));

        const uploadResponse = await fetch(auth.uploadUrl, {
          method: "POST",
          body: formData
        });

        if (!uploadResponse.ok) {
          let detail = "Echec de l'upload sur ImageKit.";
          try {
            const payload = (await uploadResponse.json()) as { message?: string };
            if (payload.message) {
              detail = payload.message;
            }
          } catch {
            // no-op
          }
          throw new ApiError(uploadResponse.status, detail);
        }

        const uploaded = (await uploadResponse.json()) as {
          fileId?: string;
          filePath?: string;
          url?: string;
          name?: string;
          size?: number;
          fileType?: string;
        };

        return addFinanceTransactionProofRequest(accessToken, transactionId, {
          storageKey: uploaded.filePath ?? uploaded.url ?? uploaded.fileId ?? selectedFile.name,
          fileName: uploaded.name ?? selectedFile.name,
          mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
          fileSize: uploaded.size ?? selectedFile.size
        });
      });

      setSuccessMessage("Preuve ajoutee.");
      setProofFiles((prev) => ({ ...prev, [transactionId]: null }));
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: proofResponse.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleToggleProofs(transactionId: string): Promise<void> {
    const isOpen = openProofs[transactionId] === true;
    if (isOpen) {
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: false
      }));
      return;
    }

    const alreadyLoaded = Array.isArray(proofsByTransaction[transactionId]);
    if (alreadyLoaded) {
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
      return;
    }

    setLoadingProofsByTransaction((prev) => ({
      ...prev,
      [transactionId]: true
    }));
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listFinanceTransactionProofsRequest(accessToken, transactionId)
      );
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: response.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: false
      }));
    }
  }

  async function handleSubmitTransaction(transactionId: string): Promise<void> {
    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => submitFinanceTransactionRequest(accessToken, transactionId));
      setSuccessMessage("Transaction soumise pour validation.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleReviewTransaction(
    transactionId: string,
    decision: "APPROVED" | "REJECTED"
  ): Promise<void> {
    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        reviewFinanceTransactionRequest(accessToken, transactionId, decision)
      );
      setSuccessMessage(decision === "APPROVED" ? "Transaction approuvee." : "Transaction rejetee.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  return (
    <>
      <header className="section-header">
        <h2>Transactions financieres</h2>
        <p>
          Saisie terrain, preuves et validation comptable pour le secteur{" "}
          <strong>{selectedActivity?.label ?? "non defini"}</strong>.
        </p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Active d'abord un secteur d'activite dans
          l'administration.
        </p>
      ) : null}

      {canCreateAccount ? (
        <section className="panel">
          <h3>Nouveau compte financier</h3>
          <form className="finance-account-form" onSubmit={handleCreateAccount}>
            <input
              type="text"
              placeholder="Nom du compte (ex: Caisse principale)"
              value={accountForm.name}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  name: event.target.value
                }))
              }
              required
            />
            <input
              type="text"
              placeholder="Reference (optionnel)"
              value={accountForm.accountRef}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  accountRef: event.target.value
                }))
              }
            />
            <input
              type="text"
              placeholder="Solde initial (ex: 100000.00)"
              value={accountForm.openingBalance}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  openingBalance: event.target.value
                }))
              }
              required
            />
            <select
              value={accountForm.scopeType}
              onChange={(event) =>
                setAccountForm((prev) => ({
                  ...prev,
                  scopeType: event.target.value as FinancialAccountScopeType
                }))
              }
            >
              {canManageGlobalAccounts ? (
                <option value="GLOBAL">Compte global entreprise</option>
              ) : null}
              <option value="DEDICATED">Compte dedie a un secteur</option>
              <option value="RESTRICTED">Compte partage sur secteurs choisis</option>
            </select>
            {!canManageGlobalAccounts ? (
              <p className="hint">
                Les comptes globaux entreprise sont reserves au proprietaire et a l'admin systeme.
              </p>
            ) : null}
            {accountForm.scopeType === "DEDICATED" ? (
              <select
                value={accountForm.primaryActivityCode}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    primaryActivityCode: event.target.value as BusinessActivityCode
                  }))
                }
                required
              >
                <option value="" disabled>
                  Selectionner le secteur dedie
                </option>
                {enabledActivities.map((activity) => (
                  <option key={activity.code} value={activity.code}>
                    {activity.label}
                  </option>
                ))}
              </select>
            ) : null}
            {accountForm.scopeType === "RESTRICTED" ? (
              <div className="metadata-field-list">
                {enabledActivities.map((activity) => {
                  const checked = accountForm.allowedActivityCodes.includes(activity.code);
                  return (
                    <label key={activity.code} className="inline-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            allowedActivityCodes: event.target.checked
                              ? [...prev.allowedActivityCodes, activity.code].filter(
                                  (value, index, array) => array.indexOf(value) === index
                                )
                              : prev.allowedActivityCodes.filter((value) => value !== activity.code)
                          }))
                        }
                      />
                      <span>{activity.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            <button type="submit">Creer compte</button>
          </form>
          <p className="hint">
            {accountForm.scopeType === "GLOBAL"
              ? "Le compte sera visible et utilisable dans tous les secteurs."
              : accountForm.scopeType === "DEDICATED"
                ? "Le compte sera reserve a un seul secteur."
                : "Le compte sera partage uniquement entre les secteurs selectionnes."}
          </p>
        </section>
      ) : null}

      <section className="panel">
        <h3>Filtres</h3>
        <form
          className="operations-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                status: event.target.value as "ALL" | FinancialTransaction["status"]
              }))
            }
          >
            <option value="ALL">Tous les statuts</option>
            <option value="DRAFT">Brouillon</option>
            <option value="SUBMITTED">Soumise</option>
            <option value="APPROVED">Approuvee</option>
            <option value="REJECTED">Rejetee</option>
          </select>
          <select
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                type: event.target.value as "ALL" | FinancialTransaction["type"]
              }))
            }
          >
            <option value="ALL">Tous les types</option>
            <option value="CASH_IN">Entree</option>
            <option value="CASH_OUT">Sortie</option>
          </select>
          <button type="submit">Appliquer</button>
        </form>
        <p className="hint">
          La liste est automatiquement alignee sur le secteur actif:{" "}
          {selectedActivity?.label ?? "non defini"}.
        </p>
      </section>

      <section className="panel">
        <h3>Nouvelle transaction</h3>
        {accounts.length === 0 ? (
          <p className="hint">
            Aucun compte financier compatible avec le secteur actif. Contacte le proprietaire,
            l'admin systeme ou le comptable.
          </p>
        ) : null}
        <form className="finance-transaction-form" onSubmit={handleCreateTransaction}>
          <select
            value={transactionForm.accountId}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                accountId: event.target.value
              }))
            }
            required
          >
            <option value="" disabled>
              Selectionner un compte
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.balance} {transactionForm.currency}) | {formatAccountScopeLabel(account)}
              </option>
            ))}
          </select>

          <select
            value={transactionForm.type}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                type: event.target.value as "CASH_IN" | "CASH_OUT"
              }))
            }
          >
            <option value="CASH_IN">Entree</option>
            <option value="CASH_OUT">Sortie</option>
          </select>

          <input
            type="text"
            placeholder="Montant"
            value={transactionForm.amount}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                amount: event.target.value
              }))
            }
            required
          />

          <select
            value={transactionForm.currency}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                currency: event.target.value
              }))
            }
          >
            {allowedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>

          <div className="scope-field">
            <span className="scope-field-label">Secteur de rattachement</span>
            <strong>{selectedActivity?.label ?? "Non defini"}</strong>
          </div>

          <input
            type="datetime-local"
            value={transactionForm.occurredAt}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                occurredAt: event.target.value
              }))
            }
            required
          />

          <input
            type="text"
            placeholder={
              selectedProfile?.finance.requiresDescription
                ? "Description metier requise"
                : "Description (optionnel)"
            }
            value={transactionForm.description}
            onChange={(event) =>
              setTransactionForm((prev) => ({
                ...prev,
                description: event.target.value
              }))
            }
          />

          {financeMetadataFields.map((field) => (
            <input
              key={field.key}
              type="text"
              placeholder={`${field.label}${field.required ? " *" : ""}`}
              value={transactionForm.metadata[field.key] ?? ""}
              onChange={(event) =>
                setTransactionForm((prev) => ({
                  ...prev,
                  metadata: {
                    ...prev.metadata,
                    [field.key]: event.target.value
                  }
                }))
              }
              required={field.required}
              title={field.helpText}
            />
          ))}

          <button
            type="submit"
            disabled={accounts.length === 0 || !selectedActivityCode || isLoadingActivities}
          >
            Creer transaction
          </button>
        </form>
        <div className="sector-form-guidance">
          <p className="hint">
            {selectedProfile?.finance.requiresProof
              ? "La preuve est obligatoire avant soumission."
              : "La preuve reste optionnelle pour ce secteur."}
          </p>
          {financeMetadataFields.length > 0 ? (
            <div className="metadata-field-list">
              {financeMetadataFields.map((field) => (
                <p key={field.key} className="hint">
                  <strong>{field.label}</strong>: {field.helpText}
                </p>
              ))}
            </div>
          ) : null}
          {financeWorkflow.length > 0 ? (
            <div className="workflow-chip-list">
              {financeWorkflow.map((step) => (
                <span key={step.code} className="workflow-chip" title={step.description}>
                  {step.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <h3>Transactions</h3>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && transactions.length === 0 ? <p>Aucune transaction.</p> : null}
        {!isLoading && transactions.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activite</th>
                  <th>Compte</th>
                  <th>Type</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Preuves</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isBusy = busyTransactionId === tx.id;
                  const isProofsOpen = openProofs[tx.id] === true;
                  const proofs = proofsByTransaction[tx.id] ?? [];
                  const isProofsLoading = loadingProofsByTransaction[tx.id] === true;

                  return (
                    <tr key={tx.id}>
                      <td>{new Date(tx.occurredAt).toLocaleString("fr-FR")}</td>
                      <td>{getBusinessActivityLabel(tx.activityCode)}</td>
                      <td>
                        <strong>{tx.accountName}</strong>
                        <div className="hint">
                          {formatAccountScopeLabel({
                            scopeType: tx.accountScopeType,
                            primaryActivityCode: tx.accountPrimaryActivityCode,
                            allowedActivityCodes: tx.accountAllowedActivityCodes
                          })}
                        </div>
                      </td>
                      <td>{tx.type === "CASH_IN" ? "Entree" : "Sortie"}</td>
                      <td>
                        {tx.amount} {tx.currency}
                      </td>
                      <td>{statusLabel(tx.status)}</td>
                      <td>
                        <div>
                          {tx.proofsCount}
                          {tx.requiresProof ? " (obligatoire)" : ""}
                        </div>
                        {tx.proofsCount > 0 ? (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleToggleProofs(tx.id)}
                            disabled={isProofsLoading}
                          >
                            {isProofsOpen ? "Masquer preuves" : "Voir preuves"}
                          </button>
                        ) : (
                          <p className="hint proof-none">Aucune preuve</p>
                        )}
                        {isProofsOpen ? (
                          <div className="proof-list">
                            {isProofsLoading ? <p>Chargement des preuves...</p> : null}
                            {!isProofsLoading && proofs.length === 0 ? (
                              <p>Aucune preuve chargee.</p>
                            ) : null}
                            {!isProofsLoading && proofs.length > 0 ? (
                              <ul>
                                {proofs.map((proof) => (
                                  <li key={proof.id}>
                                    {proof.publicUrl ? (
                                      <a href={proof.publicUrl} target="_blank" rel="noreferrer">
                                        {proof.fileName}
                                      </a>
                                    ) : (
                                      <span>{proof.fileName} (lien indisponible)</span>
                                    )}
                                    <small>
                                      {formatFileSize(proof.fileSize)} |{" "}
                                      {new Date(proof.uploadedAt).toLocaleString("fr-FR")}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleOpenTransactionDetails(tx.id, tx.activityCode)}
                          >
                            Details
                          </button>
                          {tx.status === "DRAFT" ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleSubmitTransaction(tx.id)}
                              disabled={isBusy || (tx.requiresProof && tx.proofsCount < 1)}
                              title={
                                tx.requiresProof && tx.proofsCount < 1
                                  ? "Ajoute au moins une preuve avant soumission."
                                  : undefined
                              }
                            >
                              Soumettre
                            </button>
                          ) : null}
                          {canReview && tx.status === "SUBMITTED" ? (
                            <>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => void handleReviewTransaction(tx.id, "APPROVED")}
                                disabled={isBusy}
                              >
                                Approuver
                              </button>
                              <button
                                type="button"
                                className="danger-btn"
                                onClick={() => void handleReviewTransaction(tx.id, "REJECTED")}
                                disabled={isBusy}
                              >
                                Rejeter
                              </button>
                            </>
                          ) : null}
                        </div>

                        {(tx.status === "DRAFT" || tx.status === "SUBMITTED") ? (
                          <div className="proof-inline-form">
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                              onChange={(event) =>
                                setProofFiles((prev) => ({
                                  ...prev,
                                  [tx.id]: event.target.files?.[0] ?? null
                                }))
                              }
                              disabled={isBusy}
                            />
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleAddProof(tx.id)}
                              disabled={isBusy}
                            >
                              Ajouter preuve
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selectedTransaction ? (
        <section className="panel finance-transaction-detail-panel">
          <div className="task-detail-header">
            <div>
              <h3>Detail transaction</h3>
              <p className="hint">
                {selectedTransaction.accountName} |{" "}
                {new Date(selectedTransaction.occurredAt).toLocaleString("fr-FR")}
              </p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCloseTransactionDetails}
            >
              Fermer
            </button>
          </div>

          <div className="operations-task-meta">
            <p>
              <strong>Secteur:</strong> {getBusinessActivityLabel(selectedTransaction.activityCode)}
            </p>
            <p>
              <strong>Compte:</strong> {selectedTransaction.accountName}
            </p>
            <p>
              <strong>Type:</strong> {selectedTransaction.type === "CASH_IN" ? "Entree" : "Sortie"}
            </p>
            <p>
              <strong>Montant:</strong> {selectedTransaction.amount} {selectedTransaction.currency}
            </p>
            <p>
              <strong>Statut:</strong> {statusLabel(selectedTransaction.status)}
            </p>
            <p>
              <strong>Preuves:</strong> {selectedTransaction.proofsCount}
              {selectedTransaction.requiresProof ? " (obligatoire)" : ""}
            </p>
            <p>
              <strong>Createur:</strong> {selectedTransaction.createdByEmail}
            </p>
            <p>
              <strong>Validation:</strong> {selectedTransaction.validatedByEmail ?? "En attente"}
            </p>
            <p>
              <strong>Operation:</strong>{" "}
              {new Date(selectedTransaction.occurredAt).toLocaleString("fr-FR")}
            </p>
            <p>
              <strong>Creee le:</strong>{" "}
              {new Date(selectedTransaction.createdAt).toLocaleString("fr-FR")}
            </p>
            <p>
              <strong>Derniere MAJ:</strong>{" "}
              {new Date(selectedTransaction.updatedAt).toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="metadata-detail-list">
            <p className="hint">
              <strong>Gouvernance compte</strong>
            </p>
            {getTransactionGovernanceLines(selectedTransaction).map((line) => (
              <p key={`${selectedTransaction.id}-${line}`} className="hint">
                {line}
              </p>
            ))}
          </div>

          {selectedTransaction.description?.trim() ? (
            <div className="metadata-detail-list">
              <p className="hint">
                <strong>Description</strong>
              </p>
              <p className="hint">{selectedTransaction.description}</p>
            </div>
          ) : null}

          <div className="metadata-detail-list">
            <p className="hint">
              <strong>Contexte metier</strong>
            </p>
            <p className="hint">
              {formatMetadataSummary(selectedTransaction.metadata, financeMetadataFields)}
            </p>
          </div>

          <div className="finance-transaction-detail-actions">
            <div className="actions-inline">
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  navigate(
                    `/alerts?entityType=TRANSACTION&entityId=${encodeURIComponent(selectedTransaction.id)}`
                  )
                }
              >
                Alertes liees
              </button>
              {canAccessAudit ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() =>
                    navigate(
                      `/settings/security?entityType=TRANSACTION&entityId=${encodeURIComponent(selectedTransaction.id)}`
                    )
                  }
                >
                  Audit lie
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleToggleProofs(selectedTransaction.id)}
            >
              {openProofs[selectedTransaction.id] ? "Masquer preuves" : "Voir preuves"}
            </button>
            {(selectedTransaction.status === "DRAFT" || selectedTransaction.status === "SUBMITTED") ? (
              <div className="proof-inline-form">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                  onChange={(event) =>
                    setProofFiles((prev) => ({
                      ...prev,
                      [selectedTransaction.id]: event.target.files?.[0] ?? null
                    }))
                  }
                  disabled={busyTransactionId === selectedTransaction.id}
                />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleAddProof(selectedTransaction.id)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Ajouter preuve
                </button>
              </div>
            ) : null}
          </div>

          {openProofs[selectedTransaction.id] ? (
            <div className="proof-list">
              {loadingProofsByTransaction[selectedTransaction.id] ? <p>Chargement des preuves...</p> : null}
              {!loadingProofsByTransaction[selectedTransaction.id] &&
              (proofsByTransaction[selectedTransaction.id] ?? []).length === 0 ? (
                <p>Aucune preuve chargee.</p>
              ) : null}
              {!loadingProofsByTransaction[selectedTransaction.id] &&
              (proofsByTransaction[selectedTransaction.id] ?? []).length > 0 ? (
                <ul>
                  {(proofsByTransaction[selectedTransaction.id] ?? []).map((proof) => (
                    <li key={proof.id}>
                      {proof.publicUrl ? (
                        <a href={proof.publicUrl} target="_blank" rel="noreferrer">
                          {proof.fileName}
                        </a>
                      ) : (
                        <span>{proof.fileName} (lien indisponible)</span>
                      )}
                      <small>
                        {formatFileSize(proof.fileSize)} |{" "}
                        {new Date(proof.uploadedAt).toLocaleString("fr-FR")}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {accounts.length > 0 ? (
        <section className="panel">
          <h3>Comptes compatibles avec le secteur actif</h3>
          <div className="operations-member-grid">
            {accounts.map((account) => (
              <article key={account.id} className="operations-member-card">
                <h4>{account.name}</h4>
                {getAccountGovernanceLines(account).map((line) => (
                  <p key={`${account.id}-${line}`} className="hint">
                    {line}
                  </p>
                ))}
                <p className="hint">Solde: {account.balance}</p>
                <p className="hint">
                  Compatible secteur actif:{" "}
                  {isAccountVisibleForSelectedActivity(account, selectedActivityCode) ? "Oui" : "Non"}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
