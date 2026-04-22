import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Operation impossible. Verifie la connexion backend.";
}

function statusLabel(status: SalaryTransaction["status"]): string {
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

function salaryPaymentMethodLabel(method: SalaryPaymentMethod): string {
  if (method === "BANK_TRANSFER") {
    return "Virement bancaire";
  }
  if (method === "MOBILE_MONEY") {
    return "Mobile money";
  }
  if (method === "CHEQUE") {
    return "Cheque";
  }
  return "Especes";
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
    return "Confirmee";
  }
  if (confirmationStatus === "PENDING") {
    return "En attente employe";
  }
  return "Non requise";
}

export function FinanceSalariesPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshSession, session, user } = useAuth();
  const [salaryAccounts, setSalaryAccounts] = useState<FinancialAccount[]>([]);
  const [salaryMembers, setSalaryMembers] = useState<SalaryMember[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryTransaction[]>([]);
  const [salarySummary, setSalarySummary] = useState<SalarySummary | null>(null);
  const [selectedSalaryId, setSelectedSalaryId] = useState<string | null>(null);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [busySalaryExport, setBusySalaryExport] = useState<"csv" | "xlsx" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [salaryFilters, setSalaryFilters] = useState<{
    status: "ALL" | SalaryTransaction["status"];
    payPeriod: string;
    employeeUserId: string;
  }>({
    status: "ALL",
    payPeriod: new Date().toISOString().slice(0, 7),
    employeeUserId: ""
  });
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

  const selectedSalary = useMemo(
    () => salaryItems.find((item) => item.id === selectedSalaryId) ?? null,
    [salaryItems, selectedSalaryId]
  );
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
          title: "Salaires de la periode",
          value: String(salaryItems.length),
          note: formatPayPeriod(salaryFilters.payPeriod)
        },
        {
          title: "Net total",
          value: salarySummary?.totalNetAmount ?? "0.00",
          note: "Montant net cumule"
        },
        {
          title: "En attente employe",
          value: String(pendingEmployeeCount),
          note: "Reception a confirmer"
        },
        {
          title: "Prets a approuver",
          value: String(readyForApprovalCount),
          note: "Confirmation employee recue"
        }
      ];
    }

    return [
      {
        title: "Mes salaires",
        value: String(salaryItems.length),
        note: "Elements visibles sur la periode"
      },
      {
        title: "En attente de moi",
        value: String(pendingEmployeeCount),
        note: "Reception a confirmer"
      },
      {
        title: "Approuves",
        value: String(salaryItems.filter((item) => item.status === "APPROVED").length),
        note: "Salaires finalises"
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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken(async (accessToken) => {
        const salariesPromise = listFinanceSalariesRequest(accessToken, {
          limit: 100,
          status: salaryFilters.status === "ALL" ? undefined : salaryFilters.status,
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

      setSalaryAccounts(payload.salaryAccounts);
      setSalaryMembers(payload.salaryMembers);
      setSalarySummary(payload.salarySummary);
      setSalaryItems(payload.salaryItems);
      setEditingSalaryId((prev) => (prev && payload.salaryItems.some((item) => item.id === prev) ? prev : null));
      setSelectedSalaryId((prev) => {
        if (requestedTransactionId) {
          return payload.salaryItems.some((item) => item.id === requestedTransactionId)
            ? requestedTransactionId
            : null;
        }
        return payload.salaryItems.some((item) => item.id === prev) ? prev : (payload.salaryItems[0]?.id ?? null);
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
      setIsLoading(false);
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

  async function handleSaveSalary(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await withAuthorizedToken((accessToken) => {
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

        return editingSalaryId
          ? updateFinanceSalaryRequest(accessToken, editingSalaryId, payload)
          : createFinanceSalaryRequest(accessToken, payload);
      });

      handleOpenSalaryDetails(response.item.id);
      setSuccessMessage(
        editingSalaryId
          ? "Salaire modifie. Il repasse en brouillon et devra etre soumis a nouveau."
          : "Salaire enregistre en brouillon."
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
    const isApproved = item.status === "APPROVED";
    const confirmationMessage = isApproved
      ? "Ce salaire est deja approuve. Confirmer sa suppression definitive ?"
      : "Confirmer la suppression de ce salaire ?";

    if (!window.confirm(confirmationMessage)) {
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
          ? "Salaire approuve supprime par l'admin systeme."
          : "Salaire supprime."
      );
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
        format === "xlsx" ? "Export Excel des salaires genere." : "Export CSV des salaires genere."
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
          throw new ApiError(uploadResponse.status, "Echec de l'upload sur ImageKit.");
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
      setSuccessMessage("Salaire soumis a l'employe pour confirmation.");
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
      setSuccessMessage("Reception du salaire confirmee.");
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
      setSuccessMessage(decision === "APPROVED" ? "Salaire approuve." : "Salaire rejete.");
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
        <h2>Salaires</h2>
        <p>
          Espace dedie au cycle de paie: preparation comptable, confirmation de reception par
          l'employe, puis approbation finale.
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
          className="operations-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
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
            <option value="APPROVED">Approuvee</option>
            <option value="REJECTED">Rejetee</option>
          </select>
          <button type="submit">Mettre a jour</button>
        </form>
      </section>

      {canManageSalaries ? (
        <section className="panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>{editingSalaryId ? "Modifier un salaire" : "Enregistrer un salaire"}</h3>
              <p className="hint">
                {editingSalaryId
                  ? "Toute modification remet le salaire en brouillon et reinitialise la confirmation employe."
                  : "Le salaire est cree en brouillon. Le comptable le verifie, le soumet a l'employe, puis l'approuve seulement apres confirmation de reception."}
              </p>
            </div>
          </div>

          <form className="finance-transaction-form" onSubmit={handleSaveSalary}>
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
              <option value="CASH">Especes</option>
              <option value="CHEQUE">Cheque</option>
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
                  placeholder="Montant ajoute"
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
                  placeholder="Montant deduit"
                  value={salaryForm.deductionAmount}
                  onChange={(event) =>
                    setSalaryForm((prev) => ({
                      ...prev,
                      deductionAmount: event.target.value
                    }))
                  }
                />
              </label>
            </div>
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
            <div className="scope-field">
              <span className="scope-field-label">Net a payer</span>
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
              <h3>Synthese de la periode</h3>
              <p className="hint">
                Brut {salarySummary.totalGrossAmount} | Primes {salarySummary.totalBonusAmount} |
                Retenues {salarySummary.totalDeductionAmount}
              </p>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleExportSalaries("csv")}
                disabled={busySalaryExport !== null}
              >
                {busySalaryExport === "csv" ? "Preparation..." : "Salaires CSV"}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleExportSalaries("xlsx")}
                disabled={busySalaryExport !== null}
              >
                {busySalaryExport === "xlsx" ? "Preparation..." : "Salaires Excel"}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
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
                    <td colSpan={6}>Aucun element de salaire sur cette periode.</td>
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

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <h3>Liste des salaires</h3>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && salaryItems.length === 0 ? <p>Aucun salaire sur cette periode.</p> : null}
        {!isLoading && salaryItems.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Periode</th>
                  <th>Collaborateur</th>
                  <th>Net</th>
                  <th>Statut</th>
                  <th>Reception employe</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {salaryItems.map((item) => {
                  const isBusy = busyTransactionId === item.id;
                  const canEditSalary = canManageSalaries && item.status !== "APPROVED";
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
                            Voir le detail
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
                          {canManageSalaries && item.status === "DRAFT" ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleSubmitSalary(item.id)}
                              disabled={isBusy}
                            >
                              Soumettre a l'employe
                            </button>
                          ) : null}
                          {canConfirmReceipt ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleConfirmReceipt(item.id)}
                              disabled={isBusy}
                            >
                              Confirmer reception
                            </button>
                          ) : null}
                          {canReview && item.status === "SUBMITTED" ? (
                            <>
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => void handleReviewSalary(item.id, "APPROVED")}
                                disabled={isBusy || !canApproveSalary}
                                title={
                                  canApproveSalary
                                    ? undefined
                                    : "Attendre la confirmation de reception par l'employe."
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
                              <strong>Reception:</strong>{" "}
                              {salaryConfirmationLabel(item.status, item.salaryConfirmation.status)}
                            </p>
                            {item.salaryConfirmation.confirmedAt ? (
                              <p className="hint">
                                <strong>Confirmee le:</strong>{" "}
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
                                  <p>Aucune preuve ajoutee.</p>
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
        ) : null}
      </section>

      {selectedSalary ? (
        <section className="panel finance-transaction-detail-panel">
          <div className="task-detail-header">
            <div>
              <h3>Detail du salaire</h3>
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
              <strong>Role:</strong>{" "}
              {ROLE_LABELS[selectedSalary.employeeRole as keyof typeof ROLE_LABELS] ?? selectedSalary.employeeRole}
            </p>
            <p>
              <strong>Periode:</strong> {formatPayPeriod(selectedSalary.payPeriod)}
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
              <strong>Reception employe:</strong>{" "}
              {salaryConfirmationLabel(selectedSalary.status, selectedSalary.salaryConfirmation.status)}
            </p>
            <p>
              <strong>Confirmation par:</strong>{" "}
              {selectedSalary.salaryConfirmation.confirmedByEmail ?? "En attente"}
            </p>
            <p>
              <strong>Confirmee le:</strong>{" "}
              {selectedSalary.salaryConfirmation.confirmedAt
                ? new Date(selectedSalary.salaryConfirmation.confirmedAt).toLocaleString("fr-FR")
                : "En attente"}
            </p>
            <p>
              <strong>Createur:</strong> {selectedSalary.createdByEmail}
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
              {canManageSalaries && selectedSalary.status !== "APPROVED" ? (
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
                Voir les alertes
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
                  Voir l'audit
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
                <p>Aucune preuve ajoutee.</p>
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
    </>
  );
}
