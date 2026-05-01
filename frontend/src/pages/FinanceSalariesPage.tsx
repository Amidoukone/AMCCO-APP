import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { matchesQuickSearch } from "../lib/quickSearch";
import {
  addFinanceTransactionProofRequest,
  ApiError,
  confirmFinanceSalaryReceiptRequest,
  createFinanceSalaryRequest,
  deleteFinanceSalaryRequest,
  downloadFinanceSalaryExportRequest,
  getFinanceProofUploadAuthRequest,
  getFinanceSalarySummaryRequest,
  listFinanceAccountsRequest,
  listFinanceSalariesRequest,
  listFinanceSalaryMembersRequest,
  listFinanceTransactionProofsRequest,
  reviewFinanceTransactionRequest,
  submitFinanceTransactionRequest,
  updateFinanceSalaryRequest
} from "../lib/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type {
  FinancialAccount,
  SalaryConfirmationStatus,
  SalaryMember,
  SalaryPaymentMethod,
  SalarySummary,
  SalaryTransaction,
  TransactionProof
} from "../types/finance";
import { ROLE_LABELS } from "../config/permissions";

const SALARIES_PAGE_SIZE = 100;

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

function statusLabel(status: SalaryTransaction["status"]): string {
  if (status === "DRAFT") {
    return "Brouillon";
  }
  if (status === "SUBMITTED") {
    return "Soumise";
  }
  if (status === "APPROVED") {
    return "Approuvée";
  }
  return "Rejetée";
}

function salaryPaymentMethodLabel(method: SalaryPaymentMethod): string {
  if (method === "BANK_TRANSFER") {
    return "Virement bancaire";
  }
  if (method === "MOBILE_MONEY") {
    return "Mobile money";
  }
  if (method === "CHEQUE") {
    return "Chèque";
  }
  return "Espèces";
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

function toMoneyNumber(input: string): number {
  const normalized = Number.parseFloat(input.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

function formatNetSalary(gross: string, bonus: string, deduction: string): string {
  const total = toMoneyNumber(gross) + toMoneyNumber(bonus) - toMoneyNumber(deduction);
  return total.toFixed(2);
}

function formatPayPeriod(period: string): string {
  const [year, month] = period.split("-");
  if (!year || !month) {
    return period;
  }

  const date = new Date(`${year}-${month}-01T00:00:00`);
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function salaryConfirmationLabel(
  status: SalaryTransaction["status"],
  confirmationStatus: SalaryConfirmationStatus
): string {
  if (status === "DRAFT") {
    return "Non envoye";
  }
  if (confirmationStatus === "CONFIRMED") {
    return "Confirmée";
  }
  if (confirmationStatus === "PENDING") {
    return "En attente employé";
  }
  return "Non requise";
}

export function FinanceSalariesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const [salaryAccounts, setSalaryAccounts] = useState<FinancialAccount[]>([]);
  const [salaryMembers, setSalaryMembers] = useState<SalaryMember[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryTransaction[]>([]);
  const [salarySummary, setSalarySummary] = useState<SalarySummary | null>(null);
  const [selectedSalaryId, setSelectedSalaryId] = useState<string | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [busySalaryExport, setBusySalaryExport] = useState<"csv" | "xlsx" | null>(null);
  const [isLoadingMoreSalaries, setIsLoadingMoreSalaries] = useState(false);
  const [hasMoreSalaries, setHasMoreSalaries] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const salariesViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("finance-salaries", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const salariesSearchStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("finance-salaries-search", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialSalaryFilters = useMemo(
    () => ({
      status: "ALL" as "ALL" | SalaryTransaction["status"],
      payPeriod: new Date().toISOString().slice(0, 7),
      employeeUserId: ""
    }),
    []
  );
  const [salaryFilters, setSalaryFilters] = usePersistedViewState(
    salariesViewStorageKey,
    initialSalaryFilters
  );
  const [searchQuery, setSearchQuery] = usePersistedViewState(salariesSearchStorageKey, "");
  const [salaryForm, setSalaryForm] = useState({
    accountId: "",
    employeeUserId: "",
    payPeriod: new Date().toISOString().slice(0, 7),
    grossAmount: "",
    bonusAmount: "0.00",
    deductionAmount: "0.00",
    currency: "XOF",
    paymentMethod: "BANK_TRANSFER" as SalaryPaymentMethod,
    note: "",
    occurredAt: new Date().toISOString().slice(0, 16)
  });
  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [proofsByTransaction, setProofsByTransaction] = useState<Record<string, TransactionProof[]>>(
    {}
  );
  const [salaryPendingDelete, setSalaryPendingDelete] = useState<SalaryTransaction | null>(null);
  const [openProofs, setOpenProofs] = useState<Record<string, boolean>>({});
  const [loadingProofsByTransaction, setLoadingProofsByTransaction] = useState<Record<string, boolean>>(
    {}
  );

  const canManageSalaries = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const canReview = canManageSalaries;
  const canAccessAudit = user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  const canDeleteApprovedSalaries = user?.role === "SYS_ADMIN";
  const requestedTransactionId = searchParams.get("transactionId");

  const selectedSalary = useMemo(
    () => salaryItems.find((item) => item.id === selectedSalaryId) ?? null,
    [salaryItems, selectedSalaryId]
  );
  const displaySalaryItems = useMemo(() => {
    return salaryItems.filter((item) =>
      matchesQuickSearch(searchQuery, [
        item.employeeFullName,
        item.employeeEmail,
        item.accountName,
        item.note,
        item.payPeriod,
        item.netAmount,
        item.currency,
        item.employeeRole,
        salaryPaymentMethodLabel(item.paymentMethod)
      ])
    );
  }, [salaryItems, searchQuery]);
  const resetSalaryForm = useCallback(() => {
    setEditingSalaryId(null);
    setSalaryForm({
      accountId: salaryAccounts[0]?.id ?? "",
      employeeUserId: salaryMembers[0]?.userId ?? "",
      payPeriod: new Date().toISOString().slice(0, 7),
      grossAmount: "",
      bonusAmount: "0.00",
      deductionAmount: "0.00",
      currency: "XOF",
      paymentMethod: "BANK_TRANSFER",
      note: "",
      occurredAt: new Date().toISOString().slice(0, 16)
    });
  }, [salaryAccounts, salaryMembers]);

  const salaryCards = useMemo(() => {
    const readyForApprovalCount = salaryItems.filter(
      (item) => item.status === "SUBMITTED" && item.salaryConfirmation.status === "CONFIRMED"
    ).length;
    const pendingEmployeeCount = salaryItems.filter(
      (item) => item.status === "SUBMITTED" && item.salaryConfirmation.status === "PENDING"
    ).length;

    if (canManageSalaries) {
      return [
        {
          title: "Salaires de la période",
          value: String(salaryItems.length),
          note: formatPayPeriod(salaryFilters.payPeriod)
        },
        {
          title: "Net total",
          value: salarySummary?.totalNetAmount ?? "0.00",
          note: "Montant net cumulé"
        },
        {
          title: "En attente employé",
          value: String(pendingEmployeeCount),
          note: "Réception à confirmer"
        },
        {
          title: "Prêts à approuver",
          value: String(readyForApprovalCount),
          note: "Confirmation employé reçue"
        }
      ];
    }

    return [
      {
        title: "Mes salaires",
        value: String(salaryItems.length),
        note: "Éléments visibles sur la période"
      },
      {
        title: "En attente de moi",
        value: String(pendingEmployeeCount),
        note: "Réception à confirmer"
      },
      {
        title: "Approuvés",
        value: String(salaryItems.filter((item) => item.status === "APPROVED").length),
        note: "Salaires finalisés"
      }
    ];
  }, [canManageSalaries, salaryFilters.payPeriod, salaryItems, salarySummary?.totalNetAmount]);

  const handleOpenSalaryDetails = useCallback(
    (salaryId: string) => {
      setSelectedSalaryId(salaryId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("transactionId", salaryId);
        return next;
      });
    },
    [setSearchParams]
  );

  const handleCloseSalaryDetails = useCallback(() => {
    setSelectedSalaryId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("transactionId");
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (!requestedTransactionId) {
      setSelectedSalaryId(null);
      return;
    }

    setSelectedSalaryId(requestedTransactionId);
  }, [requestedTransactionId]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    if (append) {
      setIsLoadingMoreSalaries(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken(async (accessToken) => {
        const salariesPromise = listFinanceSalariesRequest(accessToken, {
          limit: SALARIES_PAGE_SIZE,
          offset,
          status: undefined,
          employeeUserId: canManageSalaries ? salaryFilters.employeeUserId || undefined : undefined,
          payPeriod: salaryFilters.payPeriod || undefined
        });

        if (!canManageSalaries) {
          const salariesResp = await salariesPromise;
          return {
            salaryAccounts: [] as FinancialAccount[],
            salaryMembers: [] as SalaryMember[],
            salarySummary: null as SalarySummary | null,
            salaryItems: salariesResp.items
          };
        }

        const [salaryAccountsResp, salaryMembersResp, salarySummaryResp, salariesResp] =
          await Promise.all([
            listFinanceAccountsRequest(accessToken),
            listFinanceSalaryMembersRequest(accessToken),
            getFinanceSalarySummaryRequest(accessToken, {
              payPeriod: salaryFilters.payPeriod,
              employeeUserId: salaryFilters.employeeUserId || undefined
            }),
            salariesPromise
          ]);

        return {
          salaryAccounts: salaryAccountsResp.items,
          salaryMembers: salaryMembersResp.items,
          salarySummary: salarySummaryResp.item,
          salaryItems: salariesResp.items
        };
      });

      setHasMoreSalaries(payload.salaryItems.length === SALARIES_PAGE_SIZE);
      setSalaryAccounts(payload.salaryAccounts);
      setSalaryMembers(payload.salaryMembers);
      setSalarySummary(payload.salarySummary);
      setSalaryItems((prev) => {
        if (!append) {
          return payload.salaryItems;
        }
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...payload.salaryItems.filter((item) => !seen.has(item.id))];
      });
      if (!append) {
        setEditingSalaryId((prev) => (prev && payload.salaryItems.some((item) => item.id === prev) ? prev : null));
        setSelectedSalaryId((prev) => {
          if (requestedTransactionId) {
            return payload.salaryItems.some((item) => item.id === requestedTransactionId)
              ? requestedTransactionId
              : null;
          }
          return payload.salaryItems.some((item) => item.id === prev)
            ? prev
            : (payload.salaryItems[0]?.id ?? null);
        });
        const salaryIds = new Set(payload.salaryItems.map((item) => item.id));
        setProofsByTransaction((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => salaryIds.has(transactionId)))
        );
        setOpenProofs((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => salaryIds.has(transactionId)))
        );
        setLoadingProofsByTransaction((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => salaryIds.has(transactionId)))
        );
      }
      setSalaryForm((prev) => ({
        ...prev,
        accountId:
          payload.salaryAccounts.some((account) => account.id === prev.accountId)
            ? prev.accountId
            : (payload.salaryAccounts[0]?.id ?? ""),
        employeeUserId:
          payload.salaryMembers.some((member) => member.userId === prev.employeeUserId)
            ? prev.employeeUserId
            : (payload.salaryMembers[0]?.userId ?? "")
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMoreSalaries(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [
    canManageSalaries,
    requestedTransactionId,
    salaryFilters.employeeUserId,
    salaryFilters.payPeriod,
    salaryFilters.status,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleLoadMoreSalaries(): Promise<void> {
    if (isLoading || isLoadingMoreSalaries || !hasMoreSalaries) {
      return;
    }
    await loadData({
      offset: salaryItems.length,
      append: true
    });
  }

  async function handleSaveSalary(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = (await withAuthorizedToken(async (accessToken) => {
        const payload = {
          accountId: salaryForm.accountId,
          employeeUserId: salaryForm.employeeUserId,
          payPeriod: salaryForm.payPeriod,
          grossAmount: salaryForm.grossAmount.trim(),
          bonusAmount: salaryForm.bonusAmount.trim(),
          deductionAmount: salaryForm.deductionAmount.trim(),
          currency: salaryForm.currency.trim().toUpperCase(),
          paymentMethod: salaryForm.paymentMethod,
          note: salaryForm.note.trim() || undefined,
          occurredAt: new Date(salaryForm.occurredAt).toISOString()
        };

        const result = await (
          editingSalaryId
            ? updateFinanceSalaryRequest(accessToken, editingSalaryId, payload)
            : createFinanceSalaryRequest(accessToken, payload)
        );
        await submitFinanceTransactionRequest(accessToken, result.item.id);
        return result;
      })) as { item: { id: string } };

      handleOpenSalaryDetails(response.item.id);
      setSuccessMessage(
        editingSalaryId
          ? "Salaire mis à jour."
          : "Salaire enregistré."
      );
      resetSalaryForm();
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleStartEditSalary(item: SalaryTransaction): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingSalaryId(item.id);
    setSalaryForm({
      accountId: item.accountId,
      employeeUserId: item.employeeUserId,
      payPeriod: item.payPeriod,
      grossAmount: item.grossAmount,
      bonusAmount: item.bonusAmount,
      deductionAmount: item.deductionAmount,
      currency: item.currency,
      paymentMethod: item.paymentMethod,
      note: item.note ?? "",
      occurredAt: toDateTimeLocalInput(item.occurredAt)
    });
    handleOpenSalaryDetails(item.id);
  }

  function handleCancelEditSalary(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetSalaryForm();
  }

  async function handleDeleteSalary(item: SalaryTransaction): Promise<void> {
    setSalaryPendingDelete(item);
    return;

    const isApproved = item.status === "APPROVED";
    const confirmationMessage = isApproved
      ? "Ce salaire est déjà approuvé. Confirmer sa suppression définitive ?"
      : "Confirmer la suppression de ce salaire ?";

    if (false) {
      return;
    }

    setBusyTransactionId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteFinanceSalaryRequest(accessToken, item.id));
      if (selectedSalaryId === item.id) {
        handleCloseSalaryDetails();
      }
      if (editingSalaryId === item.id) {
        resetSalaryForm();
      }
      setSuccessMessage(
        isApproved
          ? "Salaire approuvé supprimé par l'admin système."
          : "Salaire supprimé."
      );
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleConfirmDeleteSalary(): Promise<void> {
    if (!salaryPendingDelete) {
      return;
    }

    const item = salaryPendingDelete;
    const isApproved = item.status === "APPROVED";
    setBusyTransactionId(item.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteFinanceSalaryRequest(accessToken, item.id));
      if (selectedSalaryId === item.id) {
        handleCloseSalaryDetails();
      }
      if (editingSalaryId === item.id) {
        resetSalaryForm();
      }
      setSuccessMessage(
        isApproved
          ? "Salaire approuvé supprimé par l'admin système."
          : "Salaire supprimé."
      );
      setSalaryPendingDelete(null);
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleExportSalaries(format: "csv" | "xlsx"): Promise<void> {
    setBusySalaryExport(format);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const blob = await withAuthorizedToken((accessToken) =>
        downloadFinanceSalaryExportRequest(accessToken, format, {
          payPeriod: salaryFilters.payPeriod,
          employeeUserId: salaryFilters.employeeUserId || undefined
        })
      );
      triggerBlobDownload(blob, `amcco-salaires-${salaryFilters.payPeriod}.${format}`);
      setSuccessMessage(
        format === "xlsx" ? "Export Excel des salaires généré." : "Export CSV des salaires généré."
      );
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusySalaryExport(null);
    }
  }

  async function handleToggleProofs(transactionId: string): Promise<void> {
    const isOpen = openProofs[transactionId] === true;
    if (isOpen) {
      setOpenProofs((prev) => ({ ...prev, [transactionId]: false }));
      return;
    }

    if (Array.isArray(proofsByTransaction[transactionId])) {
      setOpenProofs((prev) => ({ ...prev, [transactionId]: true }));
      return;
    }

    setLoadingProofsByTransaction((prev) => ({ ...prev, [transactionId]: true }));
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listFinanceTransactionProofsRequest(accessToken, transactionId)
      );
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: response.items
      }));
      setOpenProofs((prev) => ({ ...prev, [transactionId]: true }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingProofsByTransaction((prev) => ({ ...prev, [transactionId]: false }));
    }
  }

  async function handleAddProof(transactionId: string): Promise<void> {
    const selectedFile = proofFiles[transactionId];
    if (!selectedFile) {
      setErrorMessage("Sélectionnez un fichier de preuve.");
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
          throw new ApiError(uploadResponse.status, "Échec de l'upload sur ImageKit.");
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

      setSuccessMessage("Preuve ajoutée.");
      setProofFiles((prev) => ({ ...prev, [transactionId]: null }));
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: proofResponse.items
      }));
      setOpenProofs((prev) => ({ ...prev, [transactionId]: true }));
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleSubmitSalary(transactionId: string): Promise<void> {
    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => submitFinanceTransactionRequest(accessToken, transactionId));
      setSuccessMessage("Salaire transmis à l'employé.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleConfirmReceipt(transactionId: string): Promise<void> {
    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        confirmFinanceSalaryReceiptRequest(accessToken, transactionId)
      );
      setSuccessMessage("Réception du salaire confirmée.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleReviewSalary(
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
      setSuccessMessage(decision === "APPROVED" ? "Salaire approuvé." : "Salaire rejeté.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  return (
    <>
      <header className="section-header salaries-page-header">
        <h2>Salaires</h2>
        <p>
          Espace dédié au cycle de paie: préparation comptable, confirmation de réception par
          l'employé, puis approbation finale.
        </p>
      </header>

      <section className="grid">
        {salaryCards.map((card) => (
          <article key={card.title} className="metric-card finance-overview-card">
            <h2>{card.title}</h2>
            <p className="metric-value">{card.value}</p>
            <p className="metric-note">{card.note}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <h3>Filtres</h3>
        <form
          className="operations-filter-form salaries-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
          <input
            type="search"
            className="quick-search-input"
            placeholder="Recherche rapide : collaborateur, email, compte..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <input
            type="month"
            value={salaryFilters.payPeriod}
            onChange={(event) =>
              setSalaryFilters((prev) => ({
                ...prev,
                payPeriod: event.target.value
              }))
            }
          />
          {canManageSalaries ? (
            <select
              value={salaryFilters.employeeUserId}
              onChange={(event) =>
                setSalaryFilters((prev) => ({
                  ...prev,
                  employeeUserId: event.target.value
                }))
              }
            >
              <option value="">Tous les collaborateurs</option>
              {salaryMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={salaryFilters.status}
            onChange={(event) =>
              setSalaryFilters((prev) => ({
                ...prev,
                status: event.target.value as "ALL" | SalaryTransaction["status"]
              }))
            }
          >
            <option value="ALL">Tous les statuts</option>
            <option value="DRAFT">Brouillon</option>
            <option value="SUBMITTED">Soumise</option>
            <option value="APPROVED">Approuvée</option>
            <option value="REJECTED">Rejetée</option>
          </select>
          <button type="submit">Actualiser</button>
        </form>
      </section>

      {canManageSalaries ? (
        <section className="panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>{editingSalaryId ? "Modifier un salaire" : "Enregistrer un salaire"}</h3>
              <p className="hint">
                {editingSalaryId
                  ? "Modification du salaire en brouillon."
                  : "Nouveau salaire à traiter."}
              </p>
            </div>
          </div>

          <form className="finance-transaction-form finance-salary-form" onSubmit={handleSaveSalary}>
            <select
              value={salaryForm.employeeUserId}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  employeeUserId: event.target.value
                }))
              }
              required
            >
              <option value="" disabled>
                Choisir un collaborateur
              </option>
              {salaryMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName} ({ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ?? member.role})
                </option>
              ))}
            </select>
            <input
              type="month"
              value={salaryForm.payPeriod}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  payPeriod: event.target.value
                }))
              }
              required
            />
            <select
              value={salaryForm.accountId}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  accountId: event.target.value
                }))
              }
              required
            >
              <option value="" disabled>
                Compte de paiement
              </option>
              {salaryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.balance} {salaryForm.currency})
                </option>
              ))}
            </select>
            <select
              value={salaryForm.paymentMethod}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  paymentMethod: event.target.value as SalaryPaymentMethod
                }))
              }
            >
              <option value="BANK_TRANSFER">Virement bancaire</option>
              <option value="MOBILE_MONEY">Mobile money</option>
              <option value="CASH">Espèces</option>
              <option value="CHEQUE">Chèque</option>
            </select>
            <div className="salary-amount-group">
              <label className="salary-amount-field">
                <span className="salary-amount-label">Brut</span>
                <input
                  type="text"
                  placeholder="Salaire brut"
                  value={salaryForm.grossAmount}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      grossAmount: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label className="salary-amount-field">
                <span className="salary-amount-label is-positive">+ Prime</span>
                <input
                  type="text"
                  placeholder="Montant ajouté"
                  value={salaryForm.bonusAmount}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      bonusAmount: event.target.value
                    }))
                  }
                />
              </label>
              <label className="salary-amount-field">
                <span className="salary-amount-label is-negative">- Retenue</span>
                <input
                  type="text"
                  placeholder="Montant déduit"
                  value={salaryForm.deductionAmount}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      deductionAmount: event.target.value
                    }))
                  }
                />
              </label>
              <label className="salary-amount-field salary-currency-field">
                <span className="salary-amount-label">Devise</span>
                <input
                  type="text"
                  value={salaryForm.currency}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      currency: event.target.value.toUpperCase()
                    }))
                  }
                />
              </label>
            </div>
            <div className="scope-field">
              <span className="scope-field-label">Net à payer</span>
              <strong>
                {formatNetSalary(salaryForm.grossAmount, salaryForm.bonusAmount, salaryForm.deductionAmount)}{" "}
                {salaryForm.currency}
              </strong>
            </div>
            <input
              type="datetime-local"
              value={salaryForm.occurredAt}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  occurredAt: event.target.value
                }))
              }
              required
            />
            <input
              type="text"
              placeholder="Note ou commentaire (optionnel)"
              value={salaryForm.note}
              onChange={(event) =>
                setSalaryForm((prev) => ({
                  ...prev,
                  note: event.target.value
                }))
              }
            />
            <button
              type="submit"
              disabled={salaryAccounts.length === 0 || salaryMembers.length === 0}
            >
              {editingSalaryId ? "Enregistrer les modifications" : "Enregistrer le salaire"}
            </button>
            {editingSalaryId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCancelEditSalary}
              >
                Annuler la modification
              </button>
            ) : null}
          </form>
        </section>
      ) : null}

      {canManageSalaries && salarySummary ? (
        <section className="panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>Synthèse</h3>
              <p className="hint">
                Brut {salarySummary.totalGrossAmount} | Primes {salarySummary.totalBonusAmount} |
                Retenues {salarySummary.totalDeductionAmount}
              </p>
            </div>
            <div className="topbar-actions salaries-summary-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleExportSalaries("csv")}
                disabled={busySalaryExport !== null}
              >
                {busySalaryExport === "csv" ? "Préparation..." : "Salaires CSV"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleExportSalaries("xlsx")}
                disabled={busySalaryExport !== null}
              >
                {busySalaryExport === "xlsx" ? "Préparation..." : "Salaires Excel"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table salaries-table">
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Effectif</th>
                  <th>Brut</th>
                  <th>Primes</th>
                  <th>Retenues</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {salarySummary.byStatus.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Aucun salaire sur cette période.</td>
                  </tr>
                ) : (
                  salarySummary.byStatus.map((item) => (
                    <tr key={item.status}>
                      <td>{statusLabel(item.status)}</td>
                      <td>{item.count}</td>
                      <td>{item.grossAmount}</td>
                      <td>{item.bonusAmount}</td>
                      <td>{item.deductionAmount}</td>
                      <td>{item.netAmount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <h3>Liste des salaires</h3>
        {!isLoading && salaryItems.length === 0 ? <p>Aucun salaire sur cette période.</p> : null}
        {!isLoading && salaryItems.length > 0 && displaySalaryItems.length === 0 ? (
          <p>Aucun résultat pour cette recherche.</p>
        ) : null}
        {!isLoading && displaySalaryItems.length > 0 ? (
          <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Collaborateur</th>
                  <th>Net</th>
                  <th>Statut</th>
                  <th>Réception employé</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displaySalaryItems.map((item) => {
                  const isBusy = busyTransactionId === item.id;
                  const canEditSalary = canManageSalaries;
                  const canDeleteSalary =
                    item.status === "APPROVED" ? canDeleteApprovedSalaries : canManageSalaries;
                  const canConfirmReceipt =
                    user?.id === item.employeeUserId &&
                    item.status === "SUBMITTED" &&
                    item.salaryConfirmation.status === "PENDING";
                  const canApproveSalary =
                    canReview &&
                    item.status === "SUBMITTED" &&
                    item.salaryConfirmation.status === "CONFIRMED";
                  const canAddProof =
                    canManageSalaries || item.createdById === user?.id;

                  return (
                    <tr key={item.id}>
                      <td>{formatPayPeriod(item.payPeriod)}</td>
                      <td>
                        <strong>{item.employeeFullName}</strong>
                        <div className="hint">
                          {ROLE_LABELS[item.employeeRole as keyof typeof ROLE_LABELS] ?? item.employeeRole}
                        </div>
                      </td>
                      <td>
                        {item.netAmount} {item.currency}
                      </td>
                      <td>{statusLabel(item.status)}</td>
                      <td>{salaryConfirmationLabel(item.status, item.salaryConfirmation.status)}</td>
                      <td>
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleOpenSalaryDetails(item.id)}
                          >
                            Voir le salaire
                          </button>
                          {canEditSalary ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleStartEditSalary(item)}
                              disabled={isBusy}
                            >
                              Modifier
                            </button>
                          ) : null}
                          {canDeleteSalary ? (
                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => void handleDeleteSalary(item)}
                              disabled={isBusy}
                            >
                              Supprimer
                            </button>
                          ) : null}
                          {false ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleSubmitSalary(item.id)}
                              disabled={isBusy}
                            >
                              Publier
                            </button>
                          ) : null}
                          {false ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleConfirmReceipt(item.id)}
                              disabled={isBusy}
                            >
                              Confirmer
                            </button>
                          ) : null}
                          {false ? (
                            <>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => void handleReviewSalary(item.id, "APPROVED")}
                                disabled={isBusy || !canApproveSalary}
                                title={
                                  canApproveSalary
                                    ? undefined
                                    : "Attendre la confirmation de réception par l'employé."
                                }
                              >
                                Approuver
                              </button>
                              <button
                                type="button"
                                className="danger-btn"
                                onClick={() => void handleReviewSalary(item.id, "REJECTED")}
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
                              <strong>Compte:</strong> {item.accountName}
                            </p>
                            <p className="hint">
                              <strong>Mode:</strong> {salaryPaymentMethodLabel(item.paymentMethod)}
                            </p>
                            <p className="hint">
                              <strong>Brut:</strong> {item.grossAmount} {item.currency}
                            </p>
                            <p className="hint">
                              <strong>Prime:</strong> {item.bonusAmount} {item.currency}
                            </p>
                            <p className="hint">
                              <strong>Retenue:</strong> {item.deductionAmount} {item.currency}
                            </p>
                            <p className="hint">
                              <strong>Réception:</strong>{" "}
                              {salaryConfirmationLabel(item.status, item.salaryConfirmation.status)}
                            </p>
                            {item.salaryConfirmation.confirmedAt ? (
                              <p className="hint">
                                <strong>Confirmée le:</strong>{" "}
                                {new Date(item.salaryConfirmation.confirmedAt).toLocaleString("fr-FR")}
                              </p>
                            ) : null}
                            {item.note?.trim() ? (
                              <p className="hint">
                                <strong>Note:</strong> {item.note}
                              </p>
                            ) : null}
                            <div className="table-inline-meta">
                              <p className="hint">
                                <strong>Preuves:</strong> {item.proofsCount}
                              </p>
                              {item.proofsCount > 0 ? (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => void handleToggleProofs(item.id)}
                                  disabled={loadingProofsByTransaction[item.id] === true}
                                >
                                  {openProofs[item.id] ? "Masquer les preuves" : "Voir les preuves"}
                                </button>
                              ) : (
                                <p className="hint proof-none">Aucune preuve disponible</p>
                              )}
                            </div>
                            {openProofs[item.id] ? (
                              <div className="proof-list">
                                {loadingProofsByTransaction[item.id] ? <p>Chargement des preuves...</p> : null}
                                {!loadingProofsByTransaction[item.id] &&
                                (proofsByTransaction[item.id] ?? []).length === 0 ? (
                                  <p>Aucune preuve ajoutée.</p>
                                ) : null}
                                {!loadingProofsByTransaction[item.id] &&
                                (proofsByTransaction[item.id] ?? []).length > 0 ? (
                                  <ul>
                                    {(proofsByTransaction[item.id] ?? []).map((proof) => (
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
                            {canAddProof && (item.status === "DRAFT" || item.status === "SUBMITTED") ? (
                              <div className="proof-inline-form">
                                <input
                                  type="file"
                                  accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                                  onChange={(event) =>
                                    setProofFiles((prev) => ({
                                      ...prev,
                                      [item.id]: event.target.files?.[0] ?? null
                                    }))
                                  }
                                  disabled={isBusy}
                                />
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => void handleAddProof(item.id)}
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
          <div className="list-pagination">
            <p className="hint list-pagination-meta">
              {displaySalaryItems.length} salaire(s) affiché(s)
              {displaySalaryItems.length !== salaryItems.length
                ? ` sur ${salaryItems.length} chargé(s)`
                : ""}
              {hasMoreSalaries ? " sur plusieurs pages." : "."}
            </p>
            {hasMoreSalaries ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleLoadMoreSalaries()}
                disabled={isLoadingMoreSalaries}
              >
                {isLoadingMoreSalaries ? "Chargement..." : "Charger plus"}
              </button>
            ) : null}
          </div>
          </>
        ) : null}
      </section>

      {selectedSalary ? (
        <section className="panel finance-transaction-detail-panel salary-detail-panel">
          <div className="task-detail-header">
            <div>
              <h3>Détail du salaire</h3>
              <p className="hint">
                {selectedSalary.employeeFullName} | {formatPayPeriod(selectedSalary.payPeriod)}
              </p>
            </div>
            <button type="button" className="secondary-btn" onClick={handleCloseSalaryDetails}>
              Fermer
            </button>
          </div>

          <div className="operations-task-meta">
            <p>
              <strong>Collaborateur:</strong> {selectedSalary.employeeFullName} ({selectedSalary.employeeEmail})
            </p>
            <p>
              <strong>Rôle:</strong>{" "}
              {ROLE_LABELS[selectedSalary.employeeRole as keyof typeof ROLE_LABELS] ?? selectedSalary.employeeRole}
            </p>
            <p>
              <strong>Période:</strong> {formatPayPeriod(selectedSalary.payPeriod)}
            </p>
            <p>
              <strong>Compte:</strong> {selectedSalary.accountName}
            </p>
            <p>
              <strong>Net:</strong> {selectedSalary.netAmount} {selectedSalary.currency}
            </p>
            <p>
              <strong>Brut:</strong> {selectedSalary.grossAmount} {selectedSalary.currency}
            </p>
            <p>
              <strong>Prime:</strong> {selectedSalary.bonusAmount} {selectedSalary.currency}
            </p>
            <p>
              <strong>Retenue:</strong> {selectedSalary.deductionAmount} {selectedSalary.currency}
            </p>
            <p>
              <strong>Mode:</strong> {salaryPaymentMethodLabel(selectedSalary.paymentMethod)}
            </p>
            <p>
              <strong>Statut:</strong> {statusLabel(selectedSalary.status)}
            </p>
            <p>
              <strong>Réception employé:</strong>{" "}
              {salaryConfirmationLabel(selectedSalary.status, selectedSalary.salaryConfirmation.status)}
            </p>
            <p>
              <strong>Confirmation par:</strong>{" "}
              {selectedSalary.salaryConfirmation.confirmedByEmail ?? "En attente"}
            </p>
            <p>
              <strong>Confirmée le:</strong>{" "}
              {selectedSalary.salaryConfirmation.confirmedAt
                ? new Date(selectedSalary.salaryConfirmation.confirmedAt).toLocaleString("fr-FR")
                : "En attente"}
            </p>
            <p>
              <strong>Créateur:</strong> {selectedSalary.createdByEmail}
            </p>
            <p>
              <strong>Validation:</strong> {selectedSalary.validatedByEmail ?? "En attente"}
            </p>
          </div>

          {selectedSalary.note?.trim() ? (
            <div className="metadata-detail-list">
              <p className="hint">
                <strong>Note</strong>
              </p>
              <p className="hint">{selectedSalary.note}</p>
            </div>
          ) : null}

          <div className="finance-transaction-detail-actions">
            <div className="actions-inline">
              {canManageSalaries ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleStartEditSalary(selectedSalary)}
                  disabled={busyTransactionId === selectedSalary.id}
                >
                  Modifier
                </button>
              ) : null}
              {(selectedSalary.status === "APPROVED"
                ? canDeleteApprovedSalaries
                : canManageSalaries) ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void handleDeleteSalary(selectedSalary)}
                  disabled={busyTransactionId === selectedSalary.id}
                >
                  Supprimer
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  navigate(`/alerts?entityType=SALARY&entityId=${encodeURIComponent(selectedSalary.id)}`)
                }
              >
                Voir alertes
              </button>
              {canAccessAudit ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() =>
                    navigate(
                      `/settings/security?entityType=SALARY&entityId=${encodeURIComponent(selectedSalary.id)}`
                    )
                  }
                >
                  Voir audit
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleToggleProofs(selectedSalary.id)}
            >
              {openProofs[selectedSalary.id] ? "Masquer les preuves" : "Voir les preuves"}
            </button>
          </div>

          {openProofs[selectedSalary.id] ? (
            <div className="proof-list">
              {loadingProofsByTransaction[selectedSalary.id] ? <p>Chargement des preuves...</p> : null}
              {!loadingProofsByTransaction[selectedSalary.id] &&
              (proofsByTransaction[selectedSalary.id] ?? []).length === 0 ? (
                <p>Aucune preuve ajoutée.</p>
              ) : null}
              {!loadingProofsByTransaction[selectedSalary.id] &&
              (proofsByTransaction[selectedSalary.id] ?? []).length > 0 ? (
                <ul>
                  {(proofsByTransaction[selectedSalary.id] ?? []).map((proof) => (
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

      <ConfirmDialog
        open={salaryPendingDelete !== null}
        title="Confirmer la suppression du salaire"
        description="Cette action supprime l'élément de paie sélectionné de la liste salariale."
        objectLabel="Salaire concerné"
        objectName={
          salaryPendingDelete
            ? `${salaryPendingDelete.employeeFullName} | ${formatPayPeriod(salaryPendingDelete.payPeriod)}`
            : ""
        }
        impactText={
          salaryPendingDelete?.status === "APPROVED"
            ? "Ce salaire est déjà approuvé. Sa suppression doit rester exceptionnelle et justifiée."
            : "Le collaborateur et les équipes de contrôle ne pourront plus suivre ce salaire dans cet écran."
        }
        isConfirming={busyTransactionId === salaryPendingDelete?.id}
        onCancel={() => {
          if (busyTransactionId) {
            return;
          }
          setSalaryPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteSalary()}
      />
    </>
  );
}




