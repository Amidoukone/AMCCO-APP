import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  addFinanceTransactionProofRequest,
  ApiError,
  createFinanceAccountRequest,
  createFinanceTransactionRequest,
  deleteFinanceAccountRequest,
  deleteFinanceTransactionRequest,
  getFinanceProofUploadAuthRequest,
  listFinanceAccountsRequest,
  listFinanceTransactionProofsRequest,
  listFinanceTransactionsRequest,
  reviewFinanceTransactionRequest,
  submitFinanceTransactionRequest,
  updateFinanceAccountRequest,
  updateFinanceTransactionRequest
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

const EMPTY_METADATA_FIELDS: ActivityFieldDefinition[] = [];
const DEFAULT_ALLOWED_CURRENCIES = ["XOF"];

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

function toDateTimeLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, previous[field.key] ?? ""]));
}

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
}

function sameActivityCodeArray(
  left: BusinessActivityCode[],
  right: BusinessActivityCode[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameAccountForm(
  left: ReturnType<typeof buildDefaultAccountForm>,
  right: ReturnType<typeof buildDefaultAccountForm>
): boolean {
  return (
    left.name === right.name &&
    left.accountRef === right.accountRef &&
    left.openingBalance === right.openingBalance &&
    left.scopeType === right.scopeType &&
    left.primaryActivityCode === right.primaryActivityCode &&
    sameActivityCodeArray(left.allowedActivityCodes, right.allowedActivityCodes)
  );
}

function getLockedAccountMessage(account: FinancialAccount): string | null {
  if (account.transactionsCount > 0) {
    return "Ce compte financier est deja utilise par des transactions et ne peut pas etre supprime.";
  }

  return null;
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
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreateAccount = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canManageGlobalAccounts = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canReview = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const canManageTransactions = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const canManageAnyAccount = canCreateAccount;

  const canDeleteApprovedTransactions = useMemo(() => {
    return user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canManageSalaries = useMemo(() => {
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

  const financeMetadataFields = selectedProfile?.finance.metadataFields ?? EMPTY_METADATA_FIELDS;
  const allowedCurrencies = selectedProfile?.finance.allowedCurrencies ?? DEFAULT_ALLOWED_CURRENCIES;
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
  const resetAccountForm = useCallback(() => {
    setEditingAccountId(null);
    setAccountForm(buildDefaultAccountForm(selectedActivityCode, canManageGlobalAccounts));
  }, [canManageGlobalAccounts, selectedActivityCode]);

  const resetTransactionForm = useCallback(() => {
    setEditingTransactionId(null);
    setTransactionForm({
      accountId: accounts[0]?.id ?? "",
      type: "CASH_OUT",
      amount: "",
      currency: allowedCurrencies[0] ?? "XOF",
      description: "",
      metadata: syncMetadataState({}, financeMetadataFields),
      occurredAt: new Date().toISOString().slice(0, 16)
    });
  }, [accounts, allowedCurrencies, financeMetadataFields]);

  const canManageAccount = useCallback(
    (account: FinancialAccount): boolean => {
      if (!canManageAnyAccount) {
        return false;
      }
      return true;
    },
    [canManageAnyAccount]
  );
  const financePageCards = useMemo(() => {
    const submittedTransactions = transactions.filter((item) => item.status === "SUBMITTED").length;

    const cards = [
      {
        title: "Transactions chargees",
        value: String(transactions.length),
        note: selectedActivity
          ? `Secteur actif: ${selectedActivity.label}`
          : "Aucun secteur actif"
      },
      {
        title: "Comptes visibles",
        value: String(accounts.length),
        note: "Comptes compatibles avec le contexte actuel"
      },
      {
        title: "Elements a valider",
        value: String(submittedTransactions),
        note: "Transactions soumises"
      }
    ];

    return cards;
  }, [accounts.length, selectedActivity, transactions]);

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
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken(async (accessToken) => {
        if (!selectedActivityCode) {
          return {
            accounts: [] as FinancialAccount[],
            transactions: [] as FinancialTransaction[]
          };
        }

        return Promise.all([
          listFinanceAccountsRequest(accessToken, {
            activityCode: selectedActivityCode
          }),
          listFinanceTransactionsRequest(accessToken, {
            limit: 100,
            status: filters.status === "ALL" ? undefined : filters.status,
            type: filters.type === "ALL" ? undefined : filters.type,
            activityCode: selectedActivityCode
          })
        ]).then(([accountsResp, transactionsResp]) => ({
          accounts: accountsResp.items,
          transactions: transactionsResp.items
        }));
      });
      setAccounts(payload.accounts);
      setTransactions(payload.transactions);
      setEditingAccountId((prev) => (prev && payload.accounts.some((item) => item.id === prev) ? prev : null));
      setEditingTransactionId((prev) =>
        prev && payload.transactions.some((item) => item.id === prev) ? prev : null
      );
      setSelectedTransactionId((prev) => {
        if (requestedTransactionId) {
          return payload.transactions.some((item) => item.id === requestedTransactionId)
            ? requestedTransactionId
            : null;
        }
        return payload.transactions.some((item) => item.id === prev)
          ? prev
          : (payload.transactions[0]?.id ?? null);
      });
      const txIds = new Set(payload.transactions.map((item) => item.id));
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
          payload.accounts.some((account) => account.id === prev.accountId)
            ? prev.accountId
            : (payload.accounts[0]?.id ?? "")
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.type, requestedTransactionId, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setTransactionForm((prev) => {
      const nextCurrency = allowedCurrencies.includes(prev.currency)
        ? prev.currency
        : (allowedCurrencies[0] ?? "XOF");
      const nextMetadata = syncMetadataState(prev.metadata, financeMetadataFields);

      if (prev.currency === nextCurrency && sameStringRecord(prev.metadata, nextMetadata)) {
        return prev;
      }

      return {
        ...prev,
        currency: nextCurrency,
        metadata: nextMetadata
      };
    });
  }, [allowedCurrencies, financeMetadataFields]);

  useEffect(() => {
    setAccountForm((prev) => {
      const next = normalizeAccountFormForActivities(prev, enabledActivityCodes, selectedActivityCode);
      return sameAccountForm(prev, next) ? prev : next;
    });
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

  async function handleSaveAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const payload = {
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
        };

        return editingAccountId
          ? updateFinanceAccountRequest(accessToken, editingAccountId, payload)
          : createFinanceAccountRequest(accessToken, payload);
      });
      setSuccessMessage(
        editingAccountId ? "Compte financier modifié." : "Compte financier créé."
      );
      resetAccountForm();
      await loadData();
      setTransactionForm((prev) => ({
        ...prev,
        accountId: response.item.id
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleStartEditAccount(account: FinancialAccount): void {
    const lockedMessage = getLockedAccountMessage(account);
    if (lockedMessage) {
      setErrorMessage(lockedMessage);
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      accountRef: account.accountRef ?? "",
      openingBalance: account.balance,
      scopeType: account.scopeType,
      primaryActivityCode: account.primaryActivityCode ?? "",
      allowedActivityCodes: account.allowedActivityCodes
    });
  }

  function handleCancelEditAccount(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetAccountForm();
  }

  async function handleDeleteAccount(account: FinancialAccount): Promise<void> {
    const lockedMessage = getLockedAccountMessage(account);
    if (lockedMessage) {
      setErrorMessage(lockedMessage);
      setSuccessMessage(null);
      return;
    }

    if (!window.confirm(`Confirmer la suppression du compte ${account.name} ?`)) {
      return;
    }

    setBusyAccountId(account.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteFinanceAccountRequest(accessToken, account.id));
      if (editingAccountId === account.id) {
        resetAccountForm();
      }
      setSuccessMessage("Compte financier supprime.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleSaveTransaction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedActivityCode) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const payload = {
          accountId: transactionForm.accountId,
          type: transactionForm.type,
          amount: transactionForm.amount.trim(),
          currency: transactionForm.currency.trim().toUpperCase(),
          activityCode: selectedActivityCode as BusinessActivityCode,
          description: transactionForm.description.trim() || undefined,
          metadata: transactionForm.metadata,
          occurredAt: new Date(transactionForm.occurredAt).toISOString()
        };

        return editingTransactionId
          ? updateFinanceTransactionRequest(accessToken, editingTransactionId, payload)
          : createFinanceTransactionRequest(accessToken, payload);
      });
      handleOpenTransactionDetails(response.item.id, response.item.activityCode);
      setSuccessMessage(
        editingTransactionId
          ? "Transaction modifiée. Elle repasse en brouillon avant nouvelle soumission."
          : "Transaction créée en brouillon."
      );
      resetTransactionForm();
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleStartEditTransaction(transaction: FinancialTransaction): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingTransactionId(transaction.id);
    setTransactionForm({
      accountId: transaction.accountId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      description: transaction.description ?? "",
      metadata: syncMetadataState(transaction.metadata, financeMetadataFields),
      occurredAt: toDateTimeLocalInput(transaction.occurredAt)
    });
    handleOpenTransactionDetails(transaction.id, transaction.activityCode);
  }

  function handleCancelEditTransaction(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetTransactionForm();
  }

  async function handleDeleteTransaction(transaction: FinancialTransaction): Promise<void> {
    const isApproved = transaction.status === "APPROVED";
    const confirmationMessage = isApproved
      ? "Cette transaction est déjà approuvée. Confirmer sa suppression définitive ?"
      : "Confirmer la suppression de cette transaction ?";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setBusyTransactionId(transaction.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteFinanceTransactionRequest(accessToken, transaction.id)
      );
      if (selectedTransactionId === transaction.id) {
        handleCloseTransactionDetails();
      }
      if (editingTransactionId === transaction.id) {
        resetTransactionForm();
      }
      setSuccessMessage(
        isApproved
          ? "Transaction approuvée supprimée par l'admin système."
          : "Transaction supprimée."
      );
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
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
      setSuccessMessage(decision === "APPROVED" ? "Transaction approuvée." : "Transaction rejetée.");
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
          <strong>{selectedActivity?.label ?? "aucun secteur actif"}</strong>.
        </p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activite dans
          l'administration.
        </p>
      ) : null}

      <section className="grid">
        {financePageCards.map((card) => (
          <article key={card.title} className="metric-card finance-overview-card">
            <h2>{card.title}</h2>
            <p className="metric-value">{card.value}</p>
            <p className="metric-note">{card.note}</p>
          </article>
        ))}
      </section>

      {canCreateAccount ? (
        <section className="panel">
          <details className="finance-section-toggle">
            <summary className="finance-section-summary">
              <span>{editingAccountId ? "Modifier un compte financier" : "Créer un compte financier"}</span>
              <small>
                {editingAccountId
                  ? "Les comptes déjà utilisés restent verrouillés pour protéger l'historique."
                  : "Ouvrir si vous devez ajouter une nouvelle caisse ou un nouveau compte."}
              </small>
            </summary>
            <form className="finance-account-form" onSubmit={handleSaveAccount}>
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
            <button type="submit">
              {editingAccountId ? "Enregistrer les modifications" : "Créer le compte"}
            </button>
            {editingAccountId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCancelEditAccount}
              >
                Annuler la modification
              </button>
            ) : null}
            </form>
            <p className="hint">
              {accountForm.scopeType === "GLOBAL"
                ? "Le compte sera visible et utilisable dans tous les secteurs."
                : accountForm.scopeType === "DEDICATED"
                  ? "Le compte sera réservé à un seul secteur."
                  : "Le compte sera partagé uniquement entre les secteurs sélectionnés."}
            </p>
          </details>
        </section>
      ) : null}

      {canManageSalaries ? (
        <section className="panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>Salaires</h3>
              <p className="hint">
                La paie est geree sur une page dediee pour separer les controles de salaire des
                transactions courantes.
              </p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => navigate("/finance/salaries")}
            >
              Ouvrir la page salaires
            </button>
          </div>
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
            <option value="CASH_IN">Entrée</option>
            <option value="CASH_OUT">Sortie</option>
          </select>
          <button type="submit">Filtrer</button>
        </form>
        <p className="hint">
          La liste suit le secteur actif: {selectedActivity?.label ?? "aucun secteur actif"}.
        </p>
      </section>

      <section className="panel">
        <details className="finance-section-toggle" open>
          <summary className="finance-section-summary">
            <span>{editingTransactionId ? "Modifier une transaction" : "Enregistrer une transaction"}</span>
            <small>
              {editingTransactionId
                ? "Toute modification remet la transaction en brouillon avant une nouvelle soumission."
                : "Utilisez ce bloc pour la saisie courante sur le secteur actif."}
            </small>
          </summary>
          {accounts.length === 0 ? (
            <p className="hint">
              Aucun compte financier n'est disponible pour le secteur actif. Contactez le
              proprietaire, l'admin systeme ou le comptable.
            </p>
          ) : null}
          <form className="finance-transaction-form" onSubmit={handleSaveTransaction}>
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
              Choisir un compte
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
            <option value="CASH_IN">Entrée</option>
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
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
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
                ? "Description requise"
                : "Description (optionnelle)"
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
            {editingTransactionId ? "Enregistrer les modifications" : "Enregistrer la transaction"}
          </button>
          {editingTransactionId ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCancelEditTransaction}
            >
              Annuler la modification
            </button>
          ) : null}
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
        </details>
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
                  <th>Compte</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Suivi</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isBusy = busyTransactionId === tx.id;
                  const isProofsOpen = openProofs[tx.id] === true;
                  const proofs = proofsByTransaction[tx.id] ?? [];
                  const isProofsLoading = loadingProofsByTransaction[tx.id] === true;
                  const canEditTransaction = canManageTransactions && tx.status !== "APPROVED";
                  const canDeleteTransaction =
                    tx.status === "APPROVED"
                      ? canDeleteApprovedTransactions
                      : canManageTransactions;

                  return (
                    <tr key={tx.id}>
                      <td>{new Date(tx.occurredAt).toLocaleString("fr-FR")}</td>
                      <td>
                        <strong>{tx.accountName}</strong>
                        <div className="hint">
                          {tx.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {tx.activityCode
                            ? getBusinessActivityLabel(tx.activityCode)
                            : "Charge transversale entreprise"}
                        </div>
                      </td>
                      <td>
                        {tx.amount} {tx.currency}
                      </td>
                      <td>{statusLabel(tx.status)}</td>
                      <td>
                        <div>
                          {tx.proofsCount} preuve{tx.proofsCount > 1 ? "s" : ""}
                        </div>
                        <p className="hint">{tx.requiresProof ? "Justificatif requis" : "Justificatif libre"}</p>
                      </td>
                      <td>
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleOpenTransactionDetails(tx.id, tx.activityCode)}
                          >
                            Voir le detail
                          </button>
                          {canEditTransaction ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleStartEditTransaction(tx)}
                              disabled={isBusy}
                            >
                              Modifier
                            </button>
                          ) : null}
                          {canDeleteTransaction ? (
                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => void handleDeleteTransaction(tx)}
                              disabled={isBusy}
                            >
                              Supprimer
                            </button>
                          ) : null}
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
                        <details className="table-inline-details">
                          <summary className="table-inline-summary">Voir plus</summary>
                          <div className="table-inline-content">
                            <p className="hint">
                              <strong>Portee du compte:</strong>{" "}
                              {formatAccountScopeLabel({
                                scopeType: tx.accountScopeType,
                                primaryActivityCode: tx.accountPrimaryActivityCode,
                                allowedActivityCodes: tx.accountAllowedActivityCodes
                              })}
                            </p>
                            {tx.description?.trim() ? (
                              <p className="hint">
                                <strong>Description:</strong> {tx.description}
                              </p>
                            ) : null}
                            <p className="hint">
                              <strong>Contexte:</strong>{" "}
                              {formatMetadataSummary(tx.metadata, financeMetadataFields)}
                            </p>
                            {getTransactionGovernanceLines(tx).map((line) => (
                              <p key={`${tx.id}-${line}`} className="hint">
                                {line}
                              </p>
                            ))}
                            <div className="table-inline-meta">
                              {tx.proofsCount > 0 ? (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => void handleToggleProofs(tx.id)}
                                  disabled={isProofsLoading}
                                >
                                  {isProofsOpen ? "Masquer les preuves" : "Voir les preuves"}
                                </button>
                              ) : (
                                <p className="hint proof-none">Aucune preuve disponible</p>
                              )}
                            </div>
                            {isProofsOpen ? (
                              <div className="proof-list">
                                {isProofsLoading ? <p>Chargement des preuves...</p> : null}
                                {!isProofsLoading && proofs.length === 0 ? (
                                  <p>Aucune preuve ajoutee.</p>
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
                                  Ajouter une preuve
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </details>
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
              <h3>Detail de la transaction</h3>
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
              <strong>Secteur:</strong>{" "}
              {selectedTransaction.activityCode
                ? getBusinessActivityLabel(selectedTransaction.activityCode)
                : "Charge transversale entreprise"}
            </p>
            <p>
              <strong>Compte:</strong> {selectedTransaction.accountName}
            </p>
            <p>
              <strong>Type:</strong> {selectedTransaction.type === "CASH_IN" ? "Entrée" : "Sortie"}
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
            <p className="hint">{formatMetadataSummary(selectedTransaction.metadata, financeMetadataFields)}</p>
          </div>

          <div className="finance-transaction-detail-actions">
            <div className="actions-inline">
              {canManageTransactions && selectedTransaction.status !== "APPROVED" ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleStartEditTransaction(selectedTransaction)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Modifier
                </button>
              ) : null}
              {(selectedTransaction.status === "APPROVED"
                ? canDeleteApprovedTransactions
                : canManageTransactions) ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void handleDeleteTransaction(selectedTransaction)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Supprimer
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  navigate(
                    `/alerts?entityType=TRANSACTION&entityId=${encodeURIComponent(selectedTransaction.id)}`
                  )
                }
              >
                Voir les alertes
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
                  Voir l'audit
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleToggleProofs(selectedTransaction.id)}
            >
              {openProofs[selectedTransaction.id] ? "Masquer les preuves" : "Voir les preuves"}
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
                  Ajouter une preuve
                </button>
              </div>
            ) : null}
          </div>

          {openProofs[selectedTransaction.id] ? (
            <div className="proof-list">
              {loadingProofsByTransaction[selectedTransaction.id] ? <p>Chargement des preuves...</p> : null}
              {!loadingProofsByTransaction[selectedTransaction.id] &&
              (proofsByTransaction[selectedTransaction.id] ?? []).length === 0 ? (
                <p>Aucune preuve ajoutee.</p>
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
          <details className="finance-section-toggle">
            <summary className="finance-section-summary">
              <span>Consulter les comptes financiers</span>
              <small>{accounts.length} compte(s) visible(s) dans le contexte actuel.</small>
            </summary>
            <div className="operations-member-grid">
              {accounts.map((account) => {
                const canEditAccount = canManageAccount(account);
                const isLockedAccount = account.transactionsCount > 0;
                const isBusy = busyAccountId === account.id;

                return (
                  <article key={account.id} className="operations-member-card">
                    <h4>{account.name}</h4>
                    {getAccountGovernanceLines(account).map((line) => (
                      <p key={`${account.id}-${line}`} className="hint">
                        {line}
                      </p>
                    ))}
                    <p className="hint">Solde: {account.balance}</p>
                    <p className="hint">
                      Transactions liees: {account.transactionsCount}
                    </p>
                    <p className="hint">
                      Compatible secteur actif:{" "}
                      {isAccountVisibleForSelectedActivity(account, selectedActivityCode) ? "Oui" : "Non"}
                    </p>
                    {isLockedAccount ? (
                      <p className="hint">
                        Ce compte est deja utilise. La modification et la suppression sont bloquees.
                      </p>
                    ) : null}
                    {canEditAccount ? (
                      <div className="actions-inline">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleStartEditAccount(account)}
                          disabled={isBusy}
                          title={
                            isLockedAccount
                              ? "Compte deja utilise par des transactions."
                              : undefined
                          }
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => void handleDeleteAccount(account)}
                          disabled={isBusy}
                          title={
                            isLockedAccount
                              ? "Compte deja utilise par des transactions."
                              : undefined
                          }
                        >
                          Supprimer
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </details>
        </section>
      ) : null}
    </>
  );
}
