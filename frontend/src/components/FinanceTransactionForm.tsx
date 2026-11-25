import type { Dispatch, FormEvent, RefObject, SetStateAction } from "react";
import { Link } from "react-router-dom";
import type { SectorTransactionWorkspace } from "../config/sectorTransactionWorkspaces";
import type { SectorReferenceView } from "../config/sectorWorkspaces";
import { ButtonSpinner } from "./ButtonSpinner";
import { formatAmountForDisplay as formatLocalizedAmountForDisplay } from "../lib/amountFormatting";
import { type BusinessActivityCode } from "../config/businessActivities";
import type { ActivityFieldDefinition, BusinessActivityProfile, CompanyActivityItem } from "../types/activities";
import type { BeverageProduct } from "../types/beverage-stock";
import type { ActivityArticle } from "../types/articles";
import type { RentalTenant } from "../types/tenants";
import type { GeneralStoreShop } from "../types/shops";
import type { BtpProject } from "../types/projects";
import type { DailyActivityCategory } from "../types/daily-activity-categories";
import type { FinancialAccount, FinancialTransaction } from "../types/finance";
import { formatAccountScopeLabel } from "../utils/governanceDisplay";
import {
  AGENCY_OPERATION_KIND_KEY,
  AGENCY_OPERATION_LABELS,
  AGRICULTURE_OPERATION_KIND_KEY,
  AGRICULTURE_OPERATION_LABELS,
  type AgencyOperationKind,
  type AgricultureOperationKind,
  BEVERAGE_OPERATION_KIND_KEY,
  BEVERAGE_OPERATION_LABELS,
  BTP_OPERATION_KIND_KEY,
  BTP_OPERATION_LABELS,
  type BeverageOperationKind,
  type BtpOperationKind,
  DAILY_AGREEMENT_OPERATION_KEY,
  DAILY_AGREEMENT_OPERATION_LABELS,
  DAILY_PROTOCOL_CATEGORY,
  DUMP_TRUCK_OPERATION_KEY,
  DUMP_TRUCK_OPERATION_LABELS,
  type DailyAgreementOperationKind,
  FISH_FARMING_OPERATION_KIND_KEY,
  FISH_FARMING_OPERATION_LABELS,
  FOOD_OPERATION_KIND_KEY,
  FOOD_OPERATION_LABELS,
  type FishFarmingOperationKind,
  type FoodOperationKind,
  GENERAL_EXPENSE_EMPLOYEE_KINDS,
  GENERAL_EXPENSE_KIND_KEY,
  GENERAL_EXPENSE_KIND_LABELS,
  GENERAL_EXPENSE_PDG_KINDS,
  type GeneralExpenseKind,
  type GeneralExpenseOwner,
  HARDWARE_OPERATION_KIND_KEY,
  HARDWARE_OPERATION_LABELS,
  HOTEL_OPERATION_KIND_KEY,
  HOTEL_OPERATION_LABELS,
  type HardwareOperationKind,
  type HotelOperationKind,
  LIVESTOCK_OPERATION_KIND_KEY,
  LIVESTOCK_OPERATION_LABELS,
  type LivestockOperationKind,
  RENTAL_OPERATION_KIND_KEY,
  RENTAL_OPERATION_LABELS,
  type RentalOperationKind,
  STORE_OPERATION_KIND_KEY,
  STORE_OPERATION_LABELS,
  type StoreOperationKind,
  WATER_EXPENSE_KINDS,
  WATER_INCOME_KINDS,
  WATER_OPERATION_KIND_KEY,
  WATER_OPERATION_LABELS,
  type WaterOperationKind,
  cleanSectorFinanceMetadata,
  deriveAgencyAmount,
  deriveAgricultureAmount,
  deriveBeverageAmount,
  deriveBtpAmount,
  deriveFishFarmingAmount,
  deriveFoodAmount,
  deriveHardwareArticleUnitPricePatch,
  deriveHardwareMarginAmount,
  deriveHotelAmount,
  deriveLivestockAmount,
  deriveRentalAmount,
  deriveSectorAmount,
  deriveWaterAmount,
  formatAmountForDisplay,
  formatAmountForInput,
  formatEditableAmountForInput,
  getAgencyFormModeLabel,
  getAgencyOperationType,
  getAgricultureFormModeLabel,
  getAgricultureOperationType,
  getBeverageOperationKind,
  getBtpFormModeLabel,
  getBtpOperationType,
  getDailyAgreementOperationType,
  getFishFarmingFormModeLabel,
  getFishFarmingOperationType,
  getFoodFormModeLabel,
  getFoodOperationType,
  getGeneralExpensesFormModeLabel,
  getHardwareFormModeLabel,
  getHardwareOperationType,
  getHotelFormModeLabel,
  getHotelOperationType,
  getLivestockFormModeLabel,
  getLivestockOperationType,
  getMetadataInputMode,
  getRentalFormModeLabel,
  getRentalOperationType,
  getSectorOperationKindValue,
  getSectorOperationLabel,
  getSectorSuggestionDetail,
  getStoreFormModeLabel,
  getStoreOperationType,
  getWaterFormModeLabel,
  getWaterOperationType,
  isDailyProtocolCategory,
  isMoneyMetadataField,
  isQuickFillSectorActivity,
  shouldDeriveAgencyAmount,
  shouldDeriveAgricultureAmount,
  shouldDeriveBeverageAmount,
  shouldDeriveBtpAmount,
  shouldDeriveFishFarmingAmount,
  shouldDeriveFoodAmount,
  shouldDeriveGeneralExpensesAmount,
  shouldDeriveHardwareAmount,
  shouldDeriveHotelAmount,
  shouldDeriveLivestockAmount,
  shouldDeriveRentalAmount,
  shouldDeriveTransportAmount,
  shouldDeriveWaterAmount
} from "../utils/financeTransactions";

type TransactionFormState = {
  accountId: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  description: string;
  metadata: Record<string, string>;
  occurredAt: string;
};

type Props = {
  selectedActivityCode: BusinessActivityCode | null;
  recentSalePrice: string | null;
  nextSaleProductRef: RefObject<HTMLSelectElement>;
  handleSaveTransaction: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  transactionChanges: { isDirty: boolean; onChangeCapture: () => void };
  isSavingTransaction: boolean;
  transactionForm: TransactionFormState;
  setTransactionForm: Dispatch<SetStateAction<TransactionFormState>>;
  accounts: FinancialAccount[];
  storeOperationKind: StoreOperationKind;
  dailyActivityCategories: DailyActivityCategory[];
  dailyAgreementOperationKind: DailyAgreementOperationKind;
  hardwareOperationKind: HardwareOperationKind;
  foodOperationKind: FoodOperationKind;
  agricultureOperationKind: AgricultureOperationKind;
  btpOperationKind: BtpOperationKind;
  rentalOperationKind: RentalOperationKind;
  hotelOperationKind: HotelOperationKind;
  beverageOperationKind: BeverageOperationKind;
  isLegacyBeverageEdit: boolean;
  waterOperationKind: WaterOperationKind;
  agencyOperationKind: AgencyOperationKind;
  fishFarmingOperationKind: FishFarmingOperationKind;
  livestockOperationKind: LivestockOperationKind;
  generalExpenseKind: GeneralExpenseKind;
  allowedCurrencies: string[];
  selectedActivity: CompanyActivityItem | null;
  transactionWorkspace: SectorTransactionWorkspace | null;
  renderTransactionProof: () => JSX.Element;
  hasRequiredFinanceDetails: boolean;
  sectorTransactionSuggestions: FinancialTransaction[];
  applySectorTransactionSuggestion: (suggestion: FinancialTransaction) => void;
  generalExpenseSuggestions: FinancialTransaction[];
  applyGeneralExpenseSuggestion: (suggestion: FinancialTransaction) => void;
  generalExpenseOwner: GeneralExpenseOwner;
  selectedProfile: BusinessActivityProfile | null;
  generalExpenseDescriptionSuggestions: string[];
  sectorDescriptionSuggestions: string[];
  setShowGeneralExpenseCalculator: Dispatch<SetStateAction<boolean>>;
  showGeneralExpenseCalculator: boolean;
  visibleFinanceMetadataFields: ActivityFieldDefinition[];
  beverageStock: { items: BeverageProduct[]; loading: boolean; error: string | null; refresh: () => Promise<void>; };
  selectedBeverageProduct: BeverageProduct | undefined;
  tenants: RentalTenant[];
  referenceView: SectorReferenceView | null;
  shops: GeneralStoreShop[];
  projects: BtpProject[];
  hardwareRecipients: string[];
  articles: ActivityArticle[];
  hardwareCustomArticleMode: boolean;
  setHardwareCustomArticleMode: Dispatch<SetStateAction<boolean>>;
  editingTransactionId: string | null;
  serviceCategorySuggestions: string[];
  isLoadingActivities: boolean;
  transactionProofFile: File | null;
  handleCancelEditTransaction: () => void;
};

export function FinanceTransactionForm({
  selectedActivityCode,
  recentSalePrice,
  nextSaleProductRef,
  handleSaveTransaction,
  transactionChanges,
  isSavingTransaction,
  transactionForm,
  setTransactionForm,
  accounts,
  storeOperationKind,
  dailyActivityCategories,
  dailyAgreementOperationKind,
  hardwareOperationKind,
  foodOperationKind,
  agricultureOperationKind,
  btpOperationKind,
  rentalOperationKind,
  hotelOperationKind,
  beverageOperationKind,
  isLegacyBeverageEdit,
  waterOperationKind,
  agencyOperationKind,
  fishFarmingOperationKind,
  livestockOperationKind,
  generalExpenseKind,
  allowedCurrencies,
  selectedActivity,
  transactionWorkspace,
  renderTransactionProof,
  hasRequiredFinanceDetails,
  sectorTransactionSuggestions,
  applySectorTransactionSuggestion,
  generalExpenseSuggestions,
  applyGeneralExpenseSuggestion,
  generalExpenseOwner,
  selectedProfile,
  generalExpenseDescriptionSuggestions,
  sectorDescriptionSuggestions,
  setShowGeneralExpenseCalculator,
  showGeneralExpenseCalculator,
  visibleFinanceMetadataFields,
  beverageStock,
  selectedBeverageProduct,
  tenants,
  referenceView,
  shops,
  projects,
  hardwareRecipients,
  articles,
  hardwareCustomArticleMode,
  setHardwareCustomArticleMode,
  editingTransactionId,
  serviceCategorySuggestions,
  isLoadingActivities,
  transactionProofFile,
  handleCancelEditTransaction
}: Props): JSX.Element {
  return (<form
            className={`finance-transaction-form${selectedActivityCode === "BEVERAGE_DEPOT" ? " finance-transaction-form-beverage" : ""}`}
            onSubmit={handleSaveTransaction}
            onChangeCapture={transactionChanges.onChangeCapture}
            data-unsaved-sector-form={transactionChanges.isDirty || isSavingTransaction ? "true" : undefined}
          >
          <fieldset className="finance-transaction-form-section">
            <legend>Informations principales</legend>
          <div className="finance-transaction-form-quick">
            <label className="operations-inline-group">
              <span>Compte</span>
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
                    {account.name} ({formatAmountForDisplay(account.balance)} {transactionForm.currency}) | {formatAccountScopeLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            {selectedActivityCode === "GENERAL_STORE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération magasin</span>
                  <select
                    value={storeOperationKind}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      const nextKind = nextValue as StoreOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getStoreOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [STORE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        return {
                          ...prev,
                          type: nextType,
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="ACHAT">{STORE_OPERATION_LABELS.ACHAT}</option>
                    <option value="RECOUVREMENT">{STORE_OPERATION_LABELS.RECOUVREMENT}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette magasin" : "Dépense magasin"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "DAILY_ACTIVITIES" ? (
              <>
                <label className="operations-inline-group">
                  <span>Categorie</span>
                  <select
                    value={transactionForm.metadata.dailyActivityKind ?? DAILY_PROTOCOL_CATEGORY}
                    onChange={(event) => setTransactionForm((previous) => ({
                      ...previous,
                      metadata: { ...previous.metadata, dailyActivityKind: event.target.value }
                    }))}
                  >
                    {dailyActivityCategories.filter((category) => isDailyProtocolCategory(category.name)).map((category) => (
                      <option key={category.id} value={category.name}>{category.name}</option>
                    ))}
                    {dailyActivityCategories.length === 0 ? <option value={DAILY_PROTOCOL_CATEGORY}>{DAILY_PROTOCOL_CATEGORY}</option> : null}
                  </select>
                </label>
                <label className="operations-inline-group">
                  <span>Nature du mouvement</span>
                  <select
                    value={dailyAgreementOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as DailyAgreementOperationKind;
                      setTransactionForm((previous) => ({
                        ...previous,
                        type: getDailyAgreementOperationType(nextKind),
                        metadata: { ...previous.metadata, [DAILY_AGREEMENT_OPERATION_KEY]: nextKind }
                      }));
                    }}
                  >
                    {Object.entries(DAILY_AGREEMENT_OPERATION_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>{label}</option>
                    ))}
                  </select>
                </label>
                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>{transactionForm.type === "CASH_IN" ? "Entree de fonds" : "Sortie de fonds"}</strong>
                </div>
                <p className="helper-text">Creez d’abord la fiche du protocole dans Taches. Reprenez sa reference et le meme partenaire; seul le montant reellement verse se saisit ici.</p>
              </>
            ) : selectedActivityCode === "HARDWARE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Nature quincaillerie</span>
                  <select
                    value={hardwareOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as HardwareOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getHardwareOperationType(nextKind) ?? prev.type;
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [HARDWARE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = nextKind === "GLOBAL" || nextKind === "RECOUVREMENT"
                          ? null
                          : deriveSectorAmount(selectedActivityCode, nextType, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: nextKind === "GLOBAL" || nextKind === "RECOUVREMENT"
                            ? ""
                            : formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="GLOBAL">{HARDWARE_OPERATION_LABELS.GLOBAL}</option>
                    <option value="ITEM_ENTRY">{HARDWARE_OPERATION_LABELS.ITEM_ENTRY}</option>
                    <option value="RECOUVREMENT">{HARDWARE_OPERATION_LABELS.RECOUVREMENT}</option>
                    {hardwareOperationKind === "ITEM_EXIT" ? (
                      <option value="ITEM_EXIT">{HARDWARE_OPERATION_LABELS.ITEM_EXIT}</option>
                    ) : null}
                  </select>
                </label>

                {hardwareOperationKind === "GLOBAL" ? (
                  <label className="operations-inline-group">
                    <span>Flux financier</span>
                    <select
                      value={transactionForm.type}
                      onChange={(event) => {
                        const nextType = event.target.value as "CASH_IN" | "CASH_OUT";
                        setTransactionForm((prev) => ({
                          ...prev,
                          type: nextType,
                          metadata: cleanSectorFinanceMetadata(
                            selectedActivityCode,
                            nextType,
                            {
                              ...prev.metadata,
                              [HARDWARE_OPERATION_KIND_KEY]: "GLOBAL"
                            }
                          )
                        }));
                      }}
                    >
                      <option value="CASH_IN">Encaissement</option>
                      <option value="CASH_OUT">Decaissement</option>
                    </select>
                  </label>
                ) : (
                  <div className="operations-inline-group">
                    <span>Flux financier</span>
                    <strong>
                      {transactionForm.type === "CASH_IN"
                        ? HARDWARE_OPERATION_LABELS[hardwareOperationKind]
                        : "Achat"}
                    </strong>
                  </div>
                )}
              </>
            ) : selectedActivityCode === "FOOD" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération alimentaire</span>
                  <select
                    value={foodOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as FoodOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getFoodOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [FOOD_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveFoodAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="PRODUCT_SALE">{FOOD_OPERATION_LABELS.PRODUCT_SALE}</option>
                    <option value="PRODUCT_PURCHASE">{FOOD_OPERATION_LABELS.PRODUCT_PURCHASE}</option>
                    <option value="SUPPLIER_PAYMENT">{FOOD_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                    <option value="STOCK_LOSS">{FOOD_OPERATION_LABELS.STOCK_LOSS}</option>
                    <option value="COLD_CHAIN_EXPENSE">{FOOD_OPERATION_LABELS.COLD_CHAIN_EXPENSE}</option>
                    <option value="PACKAGING_EXPENSE">{FOOD_OPERATION_LABELS.PACKAGING_EXPENSE}</option>
                    <option value="CUSTOMER_REFUND">{FOOD_OPERATION_LABELS.CUSTOMER_REFUND}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette alimentaire" : "Dépense alimentaire"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "AGRICULTURE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération agricole</span>
                  <select
                    value={agricultureOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as AgricultureOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getAgricultureOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [AGRICULTURE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveAgricultureAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="INPUT_PURCHASE">{AGRICULTURE_OPERATION_LABELS.INPUT_PURCHASE}</option>
                    <option value="FIELD_EXPENSE">{AGRICULTURE_OPERATION_LABELS.FIELD_EXPENSE}</option>
                    <option value="HARVEST_SALE">{AGRICULTURE_OPERATION_LABELS.HARVEST_SALE}</option>
                    <option value="SUPPORT_INCOME">{AGRICULTURE_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette agricole" : "Dépense agricole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "BTP" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération BTP</span>
                  <select
                    value={btpOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as BtpOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getBtpOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [BTP_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveBtpAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="CLIENT_PAYMENT">{BTP_OPERATION_LABELS.CLIENT_PAYMENT}</option>
                    <option value="MATERIAL_PURCHASE">{BTP_OPERATION_LABELS.MATERIAL_PURCHASE}</option>
                    <option value="LABOR_PAYMENT">{BTP_OPERATION_LABELS.LABOR_PAYMENT}</option>
                    <option value="EQUIPMENT_RENTAL">{BTP_OPERATION_LABELS.EQUIPMENT_RENTAL}</option>
                    <option value="SUBCONTRACTING">{BTP_OPERATION_LABELS.SUBCONTRACTING}</option>
                    <option value="SITE_EXPENSE">{BTP_OPERATION_LABELS.SITE_EXPENSE}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette chantier" : "Dépense chantier"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "RENTAL" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération</span>
                  <select
                    value={rentalOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as RentalOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getRentalOperationType(nextKind) ?? prev.type;
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [RENTAL_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveRentalAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="LOYER">{RENTAL_OPERATION_LABELS.LOYER}</option>
                    <option value="CAUTION">{RENTAL_OPERATION_LABELS.CAUTION}</option>
                    <option value="AUTRE">{RENTAL_OPERATION_LABELS.AUTRE}</option>
                  </select>
                </label>

                {rentalOperationKind === "LOYER" || rentalOperationKind === "CAUTION" ? (
                  <div className="operations-inline-group">
                    <span>Flux financier</span>
                    <strong>Recette locative</strong>
                  </div>
                ) : (
                  <label className="operations-inline-group">
                    <span>Flux financier</span>
                    <select
                      value={transactionForm.type}
                      onChange={(event) => {
                        const nextType = event.target.value as "CASH_IN" | "CASH_OUT";
                        setTransactionForm((prev) => ({
                          ...prev,
                          type: nextType,
                          metadata: cleanSectorFinanceMetadata(
                            selectedActivityCode,
                            nextType,
                            {
                              ...prev.metadata,
                              [RENTAL_OPERATION_KIND_KEY]: "AUTRE"
                            }
                          )
                        }));
                      }}
                    >
                      <option value="CASH_IN">Encaissement</option>
                      <option value="CASH_OUT">Decaissement</option>
                    </select>
                  </label>
                )}
              </>
            ) : selectedActivityCode === "HOTEL_LODGING" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération hôtelière</span>
                  <select
                    value={hotelOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as HotelOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getHotelOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [HOTEL_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveHotelAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="ROOM_PAYMENT">{HOTEL_OPERATION_LABELS.ROOM_PAYMENT}</option>
                    <option value="BOOKING_DEPOSIT">{HOTEL_OPERATION_LABELS.BOOKING_DEPOSIT}</option>
                    <option value="RESTAURANT_SALE">{HOTEL_OPERATION_LABELS.RESTAURANT_SALE}</option>
                    <option value="EVENT_SERVICE">{HOTEL_OPERATION_LABELS.EVENT_SERVICE}</option>
                    <option value="LAUNDRY_SERVICE">{HOTEL_OPERATION_LABELS.LAUNDRY_SERVICE}</option>
                    <option value="ROOM_MAINTENANCE">{HOTEL_OPERATION_LABELS.ROOM_MAINTENANCE}</option>
                    <option value="SUPPLIER_PAYMENT">{HOTEL_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                    <option value="COMMISSION_FEE">{HOTEL_OPERATION_LABELS.COMMISSION_FEE}</option>
                    <option value="TAX_PAYMENT">{HOTEL_OPERATION_LABELS.TAX_PAYMENT}</option>
                    <option value="GUEST_REFUND">{HOTEL_OPERATION_LABELS.GUEST_REFUND}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette hôtelière" : "Dépense hôtelière"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "BEVERAGE_DEPOT" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération</span>
                  <select
                    value={beverageOperationKind}
                    disabled={isLegacyBeverageEdit}
                    onChange={(event) => {
                      const nextKind = event.target.value as BeverageOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = nextKind === "VENTE" || nextKind === "AUTRE_RECETTE" ? "CASH_IN" : "CASH_OUT";
                        const nextMetadata = cleanSectorFinanceMetadata(selectedActivityCode, nextType, {
                          ...prev.metadata,
                          ...(nextKind === "ACHAT_STOCK" && getBeverageOperationKind(prev.type, prev.metadata) !== "ACHAT_STOCK" ? { purchaseUnitPrice: "" } : {}),
                          [BEVERAGE_OPERATION_KIND_KEY]: nextKind
                        });
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(deriveBeverageAmount(nextKind, nextMetadata) ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    {Object.entries(BEVERAGE_OPERATION_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>{label}</option>
                    ))}
                  </select>
                </label>
                <div className="operations-inline-group">
                  <span>Mouvement de caisse</span>
                  <strong>{transactionForm.type === "CASH_IN" ? "Entrée d'argent" : "Sortie d'argent"}</strong>
                </div>
              </>
            ) : selectedActivityCode === "WATER" ? (
              <>
                <label className="operations-inline-group">
                  <span>Catégorie</span>
                  <select
                    value={waterOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as WaterOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getWaterOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [WATER_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveWaterAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <optgroup label="Ventes">
                      {WATER_INCOME_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {WATER_OPERATION_LABELS[kind]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Dépenses">
                      {WATER_EXPENSE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {WATER_OPERATION_LABELS[kind]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette eau" : "Dépense eau"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "REAL_ESTATE_AGENCY" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération agence immobilière</span>
                  <select
                    value={agencyOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as AgencyOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getAgencyOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [AGENCY_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveAgencyAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="SALE_COMMISSION">{AGENCY_OPERATION_LABELS.SALE_COMMISSION}</option>
                    <option value="RENTAL_COMMISSION">{AGENCY_OPERATION_LABELS.RENTAL_COMMISSION}</option>
                    <option value="MANDATE_FEE">{AGENCY_OPERATION_LABELS.MANDATE_FEE}</option>
                    <option value="VISIT_FEE">{AGENCY_OPERATION_LABELS.VISIT_FEE}</option>
                    <option value="FILE_FEE">{AGENCY_OPERATION_LABELS.FILE_FEE}</option>
                    <option value="ADVERTISING_EXPENSE">{AGENCY_OPERATION_LABELS.ADVERTISING_EXPENSE}</option>
                    <option value="FIELD_VISIT_EXPENSE">{AGENCY_OPERATION_LABELS.FIELD_VISIT_EXPENSE}</option>
                    <option value="BROKER_PAYOUT">{AGENCY_OPERATION_LABELS.BROKER_PAYOUT}</option>
                    <option value="DOCUMENT_EXPENSE">{AGENCY_OPERATION_LABELS.DOCUMENT_EXPENSE}</option>
                    <option value="CUSTOMER_REFUND">{AGENCY_OPERATION_LABELS.CUSTOMER_REFUND}</option>
                    <option value="OFFICE_EXPENSE">{AGENCY_OPERATION_LABELS.OFFICE_EXPENSE}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette agence" : "Dépense agence"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "FISH_FARMING" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération piscicole</span>
                  <select
                    value={fishFarmingOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as FishFarmingOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getFishFarmingOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [FISH_FARMING_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveFishFarmingAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="FINGERLING_PURCHASE">{FISH_FARMING_OPERATION_LABELS.FINGERLING_PURCHASE}</option>
                    <option value="FEED_PURCHASE">{FISH_FARMING_OPERATION_LABELS.FEED_PURCHASE}</option>
                    <option value="POND_EXPENSE">{FISH_FARMING_OPERATION_LABELS.POND_EXPENSE}</option>
                    <option value="FISH_SALE">{FISH_FARMING_OPERATION_LABELS.FISH_SALE}</option>
                    <option value="SUPPORT_INCOME">{FISH_FARMING_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette piscicole" : "Dépense piscicole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "LIVESTOCK" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération élevage</span>
                  <select
                    value={livestockOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as LivestockOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getLivestockOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [LIVESTOCK_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveLivestockAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="ANIMAL_PURCHASE">{LIVESTOCK_OPERATION_LABELS.ANIMAL_PURCHASE}</option>
                    <option value="FEED_PURCHASE">{LIVESTOCK_OPERATION_LABELS.FEED_PURCHASE}</option>
                    <option value="VET_CARE">{LIVESTOCK_OPERATION_LABELS.VET_CARE}</option>
                    <option value="FARM_EXPENSE">{LIVESTOCK_OPERATION_LABELS.FARM_EXPENSE}</option>
                    <option value="ANIMAL_SALE">{LIVESTOCK_OPERATION_LABELS.ANIMAL_SALE}</option>
                    <option value="PRODUCT_SALE">{LIVESTOCK_OPERATION_LABELS.PRODUCT_SALE}</option>
                    <option value="SUPPORT_INCOME">{LIVESTOCK_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette élevage" : "Dépense élevage"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "GENERAL_EXPENSES" ? (
              <>
                <label className="operations-inline-group">
                  <span>Catégorie de dépense</span>
                  <select
                    value={generalExpenseKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as GeneralExpenseKind;
                      setTransactionForm((prev) => {
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          "CASH_OUT",
                          {
                            ...prev.metadata,
                            [GENERAL_EXPENSE_KIND_KEY]: nextKind
                          }
                        );
                        return {
                          ...prev,
                          type: "CASH_OUT",
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <optgroup label="PDG">
                      {GENERAL_EXPENSE_PDG_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {GENERAL_EXPENSE_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Employé">
                      {GENERAL_EXPENSE_EMPLOYEE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {GENERAL_EXPENSE_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              </>
            ) : selectedActivityCode === "TRANSPORT" &&
              transactionForm.metadata.transportCategory === "Camion benne" ? (
              <div className="operations-inline-group">
                <span>Flux de l'opération</span>
                <strong>{transactionForm.type === "CASH_IN" ? "Entrée" : "Sortie"}</strong>
                <small className="hint">
                  {DUMP_TRUCK_OPERATION_LABELS[transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] ?? ""] ?? "Choisissez l'opération camion benne dans les détails."}
                </small>
              </div>
            ) : (
              <label className="operations-inline-group">
                <span>Type</span>
                <select
                  value={transactionForm.type}
                  onChange={(event) => {
                    const nextType = event.target.value as "CASH_IN" | "CASH_OUT";
                    setTransactionForm((prev) => ({
                      ...prev,
                      type: nextType
                    }));
                  }}
                >
                  <option value="CASH_IN">Entrée</option>
                  <option value="CASH_OUT">Sortie</option>
                </select>
              </label>
            )}

            <label className="operations-inline-group">
              <span>Montant</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Montant"
                value={transactionForm.amount}
                readOnly={selectedActivityCode === "BEVERAGE_DEPOT" && (beverageOperationKind === "VENTE" || beverageOperationKind === "ACHAT_STOCK")}
                onChange={(event) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    amount: formatEditableAmountForInput(event.target.value)
                  }))
                }
                onBlur={() =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    amount: formatAmountForInput(prev.amount)
                  }))
                }
                required
              />
              {selectedActivityCode === "BEVERAGE_DEPOT" && (beverageOperationKind === "VENTE" || beverageOperationKind === "ACHAT_STOCK") ? (
                <span className="hint">Total calculé automatiquement : quantité × prix {beverageOperationKind === "VENTE" ? "de vente" : "d'achat"} unitaire.</span>
              ) : null}
            </label>

            <label className="operations-inline-group">
              <span>Devise</span>
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
            </label>
          </div>
          </fieldset>

          <div className="scope-field finance-transaction-form-context">
            <span className="scope-field-label">Contexte de saisie</span>
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            <span className="hint">
              Compte et devise sont présélectionnés selon le contexte actif.
            </span>
          </div>

          {!transactionWorkspace ? renderTransactionProof() : null}

          <details className="finance-transaction-form-options" open={hasRequiredFinanceDetails || Boolean(transactionWorkspace)}>
            <summary>{selectedActivityCode === "TRANSPORT" ? "Détails Transport" : selectedActivityCode === "HYDROCARBON" ? "Détails Hydrocarbure" : "Détails de l'opération"}</summary>
            <div className="finance-transaction-form-options-body">
              {selectedActivityCode === "BEVERAGE_DEPOT" ? (
                <p className="hint finance-form-mode-hint">
                  {beverageOperationKind === "VENTE"
                    ? isLegacyBeverageEdit ? "Historique antérieur au suivi de stock : les produits, quantités et prix sont conservés. Les références et précisions restent modifiables. Le stock actuel n'est pas modifié." : "Choisissez le produit en stock, puis la quantité et le prix de vente dans son unité. Le coût d'achat provient automatiquement du stock."
                    : beverageOperationKind === "ACHAT_STOCK"
                      ? isLegacyBeverageEdit ? "Achat historique : les produits, quantités et prix sont conservés. Cette modification ne crée pas une nouvelle entrée de stock." : "Choisissez le produit, puis le fournisseur, la quantité reçue et le prix d'achat dans l'unité du produit. Le stock augmente à l'enregistrement."
                      : beverageOperationKind === "DEPENSE"
                        ? "Choisissez la nature de la dépense et saisissez le montant payé."
                        : "Saisissez le montant reçu pour une recette qui n'est pas une vente de boissons."}
                  {" Les champs marqués * sont obligatoires."}
                </p>
              ) : null}
              {selectedActivityCode === "HYDROCARBON" ? (
                <p className="hint finance-form-mode-hint">Choisissez d'abord le produit ou l'équipement. La quantité et le partenaire sont utiles pour les produits ; la référence est demandée pour une citerne.</p>
              ) : null}
              {selectedActivityCode === "TRANSPORT" ? (
                <p className="hint finance-form-mode-hint">
                  Choisissez le type de véhicule. Pour un camion benne, sélectionnez ensuite l'opération ; le sens du flux et les détails utiles s'adaptent automatiquement.
                </p>
              ) : null}
              {selectedActivityCode === "HARDWARE" ? (
                <p className="hint finance-form-mode-hint">
                  {getHardwareFormModeLabel(hardwareOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "GENERAL_STORE" ? (
                <p className="hint finance-form-mode-hint">
                  {getStoreFormModeLabel(storeOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "FOOD" ? (
                <p className="hint finance-form-mode-hint">
                  {getFoodFormModeLabel(foodOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "AGRICULTURE" ? (
                <p className="hint finance-form-mode-hint">
                  {getAgricultureFormModeLabel(agricultureOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "BTP" ? (
                <p className="hint finance-form-mode-hint">
                  {getBtpFormModeLabel(btpOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "RENTAL" ? (
                <p className="hint finance-form-mode-hint">
                  {getRentalFormModeLabel(rentalOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "HOTEL_LODGING" ? (
                <p className="hint finance-form-mode-hint">
                  {getHotelFormModeLabel(hotelOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "WATER" ? (
                <p className="hint finance-form-mode-hint">
                  {getWaterFormModeLabel(waterOperationKind)}
                </p>
              ) : null}
              {isQuickFillSectorActivity(selectedActivityCode) && sectorTransactionSuggestions.length > 0 ? (
                <div className="finance-transaction-suggestions">
                  <strong>Remplissage rapide</strong>
                  <span className="hint">Cliquez sur une opération déjà enregistrée pour remplir les mêmes champs, puis vérifiez avant d'enregistrer.</span>
                  <div className="finance-transaction-suggestions-list">
                    {sectorTransactionSuggestions.map((suggestion) => {
                      const suggestionKind = getSectorOperationKindValue(
                        selectedActivityCode,
                        suggestion.type,
                        suggestion.metadata
                      );
                      const detail = getSectorSuggestionDetail(
                        selectedActivityCode,
                        suggestionKind,
                        suggestion.metadata,
                        suggestion.currency
                      );
                      return (
                        <button
                          key={suggestion.id}
                          type="button"
                          className="finance-transaction-suggestion"
                          onClick={() => applySectorTransactionSuggestion(suggestion)}
                        >
                          <span className="finance-transaction-suggestion-head">
                            <span className="finance-transaction-suggestion-title">
                              {suggestion.description?.trim() || getSectorOperationLabel(selectedActivityCode, suggestionKind)}
                            </span>
                            <span className="finance-transaction-suggestion-amount">
                              {formatAmountForDisplay(suggestion.amount)} {suggestion.currency}
                            </span>
                          </span>
                          {detail ? <small>{detail}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {selectedActivityCode === "GENERAL_EXPENSES" && generalExpenseSuggestions.length > 0 ? (
                <div className="finance-transaction-suggestions">
                  <strong>Remplissage rapide</strong>
                  <span className="hint">Cliquez sur une dépense déjà enregistrée pour remplir les mêmes champs, puis vérifiez avant d'enregistrer.</span>
                  <div className="finance-transaction-suggestions-list">
                    {generalExpenseSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="finance-transaction-suggestion"
                        onClick={() => applyGeneralExpenseSuggestion(suggestion)}
                      >
                        <span className="finance-transaction-suggestion-head">
                          <span className="finance-transaction-suggestion-title">
                            {suggestion.description?.trim() || GENERAL_EXPENSE_KIND_LABELS[generalExpenseKind]}
                          </span>
                          <span className="finance-transaction-suggestion-amount">
                            {formatAmountForDisplay(suggestion.amount)} {suggestion.currency}
                          </span>
                        </span>
                        {suggestion.metadata.quantity && suggestion.metadata.unitPrice ? (
                          <small>{suggestion.metadata.quantity} × {formatAmountForDisplay(suggestion.metadata.unitPrice)} {suggestion.currency}</small>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedActivityCode === "REAL_ESTATE_AGENCY" ? (
                <p className="hint finance-form-mode-hint">
                  {getAgencyFormModeLabel(agencyOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "FISH_FARMING" ? (
                <p className="hint finance-form-mode-hint">
                  {getFishFarmingFormModeLabel(fishFarmingOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "LIVESTOCK" ? (
                <p className="hint finance-form-mode-hint">
                  {getLivestockFormModeLabel(livestockOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "GENERAL_EXPENSES" ? (
                <p className="hint finance-form-mode-hint">
                  {getGeneralExpensesFormModeLabel(generalExpenseOwner)}
                </p>
              ) : null}

              <label className="operations-inline-group">
                <span>Date et heure de l'opération</span>
                <input
                  type="datetime-local"
                  value={transactionForm.occurredAt}
                  onChange={(event) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      occurredAt: event.target.value
                    }))
                  }
                />
              </label>

              <label className="operations-inline-group">
                <span>{selectedActivityCode === "BEVERAGE_DEPOT" ? "Précision (facultative)" : transactionWorkspace ? selectedProfile?.finance.fields.find((field) => field.key === "description")?.label ?? "Description" : "Description"}</span>
                <input
                  type="text"
                  placeholder={
                    selectedProfile?.finance.requiresDescription ? "Requise" : "Optionnelle"
                  }
                  value={transactionForm.description}
                  onChange={(event) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      description: event.target.value
                    }))
                  }
                  required={selectedProfile?.finance.requiresDescription ?? false}
                  list={
                    selectedActivityCode === "GENERAL_EXPENSES"
                      ? "general-expense-description-options"
                      : isQuickFillSectorActivity(selectedActivityCode)
                        ? "sector-transaction-description-options"
                        : undefined
                  }
                />
                {selectedActivityCode === "BEVERAGE_DEPOT" ? <span className="hint">Vous pouvez laisser ce champ vide. Ajoutez un client ou une remarque si nécessaire.</span> : null}
                {selectedActivityCode === "GENERAL_EXPENSES" ? (
                  <datalist id="general-expense-description-options">
                    {generalExpenseDescriptionSuggestions.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                ) : null}
                {isQuickFillSectorActivity(selectedActivityCode) ? (
                  <datalist id="sector-transaction-description-options">
                    {sectorDescriptionSuggestions.map((value) => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                ) : null}
                {(selectedActivityCode === "GENERAL_EXPENSES" && generalExpenseDescriptionSuggestions.length > 0) ||
                (isQuickFillSectorActivity(selectedActivityCode) && sectorDescriptionSuggestions.length > 0) ? (
                  <span className="hint">Les libellés déjà utilisés pour cette catégorie s'affichent pendant la saisie.</span>
                ) : null}
              </label>

              {selectedActivityCode === "GENERAL_EXPENSES" ? (
                <button
                  type="button"
                  className="secondary-btn general-expense-calculator-toggle"
                  onClick={() => setShowGeneralExpenseCalculator((prev) => !prev)}
                >
                  {showGeneralExpenseCalculator
                    ? "Saisir le montant directement"
                    : "Calculer le montant (quantité × prix unitaire)"}
                </button>
              ) : null}

              {visibleFinanceMetadataFields.map((field) => {
                if (selectedActivityCode === "BEVERAGE_DEPOT" && !isLegacyBeverageEdit && beverageOperationKind === "VENTE" && field.key === "purchaseUnitPrice") return null;
                if (selectedActivityCode === "BEVERAGE_DEPOT" && !isLegacyBeverageEdit && field.key === "productName") return (
                  <div key={field.key} className="operations-inline-group">
                    <label className="operations-inline-group"><span>Produit en stock *</span>
                      <select ref={nextSaleProductRef} required disabled={beverageStock.loading || Boolean(beverageStock.error)} value={transactionForm.metadata.beverageProductId ?? ""} onChange={(event) => {
                        const product = beverageStock.items.find((item) => item.id === event.target.value);
                        setTransactionForm((previous) => ({ ...previous,
                          amount: !editingTransactionId && beverageOperationKind === "VENTE" ? "" : previous.amount,
                          metadata: { ...previous.metadata,
                          ...(!editingTransactionId && beverageOperationKind === "VENTE" ? { saleUnitPrice: "" } : {}),
                          beverageProductId: product?.id ?? "", productName: product?.name ?? "", beverageUnit: product?.unit ?? "",
                          purchaseUnitPrice: beverageOperationKind === "VENTE" ? product?.averageUnitCost ?? "" : "" } }));
                      }}><option value="">Choisir un produit</option>{beverageStock.items.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.quantity} {product.unit} disponible(s)</option>)}</select>
                      {selectedBeverageProduct ? <span className="hint">Unité : {selectedBeverageProduct.unit}. Disponible : {selectedBeverageProduct.quantity}. {beverageOperationKind === "VENTE" ? `Coût moyen d'achat : ${formatLocalizedAmountForDisplay(selectedBeverageProduct.averageUnitCost)} XOF par ${selectedBeverageProduct.unit}.` : ""}</span> : <span className="hint">Produit absent ? Ajoutez-le dans Stock disponible avant de saisir l'opération.</span>}
                    </label>
                    {recentSalePrice ? <button type="button" className="secondary-btn" disabled={isSavingTransaction}
                      onClick={() => {
                        transactionChanges.onChangeCapture();
                        setTransactionForm((previous) => {
                          const metadata = { ...previous.metadata, saleUnitPrice: formatAmountForInput(recentSalePrice) };
                          return { ...previous, metadata, amount: formatAmountForInput(deriveBeverageAmount("VENTE", metadata) ?? "") };
                        });
                      }}>Reprendre le prix récent · {formatLocalizedAmountForDisplay(recentSalePrice)} {transactionForm.currency}</button> : null}
                  </div>
                );
                const beverageRequiredFields = beverageOperationKind === "VENTE"
                  ? ["productName", "quantity", "purchaseUnitPrice", "saleUnitPrice"]
                  : beverageOperationKind === "ACHAT_STOCK"
                    ? ["productName", "quantity", "purchaseUnitPrice", "supplierRef"]
                    : beverageOperationKind === "DEPENSE"
                      ? ["expenseCategory"]
                      : [];
                const isFieldRequired = field.required || (
                  selectedActivityCode === "BEVERAGE_DEPOT" && beverageRequiredFields.includes(field.key)
                ) || (
                  selectedActivityCode === "HYDROCARBON" &&
                  transactionForm.metadata.hydrocarbonCategory === "Citerne" &&
                  field.key === "hydrocarbonAssetRef"
                ) || (
                  selectedActivityCode === "TRANSPORT" &&
                  transactionForm.metadata.transportCategory === "Camion benne" &&
                  (field.key === DUMP_TRUCK_OPERATION_KEY ||
                    field.key === "vehicleRef" ||
                    (transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] === "VERSEMENT_AMCCO" &&
                      field.key === "counterpartyRef") ||
                    ((transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] === "TRAVAUX" ||
                      transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] === "LOCATION") &&
                      ["quantity", "purchaseUnitPrice", "routeRef"].includes(field.key)) ||
                    (["DEPENSE", "ENTRETIEN", "CARBURANT"].includes(
                      transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] ?? ""
                    ) && field.key === "expenseCategory"))
                );
                const fieldLabel = selectedActivityCode === "BEVERAGE_DEPOT"
                  ? `${field.label}${isFieldRequired ? " *" : " (facultatif)"}`
                  : field.label;
                if (
                  selectedActivityCode === "GENERAL_EXPENSES" &&
                  !showGeneralExpenseCalculator &&
                  (field.key === "quantity" || field.key === "unitPrice")
                ) {
                  return null;
                }

                if (selectedActivityCode === "RENTAL" && field.key === "tenantRef") {
                  const tenantNameValue = transactionForm.metadata.tenantRef ?? "";
                  const selectedTenantId =
                    tenants.find((tenant) => tenant.name === tenantNameValue)?.id ?? "";
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={selectedTenantId}
                        onChange={(event) => {
                          const nextTenantId = event.target.value;
                          const selectedTenant = tenants.find((tenant) => tenant.id === nextTenantId);
                          setTransactionForm((prev) => {
                            const nextMetadata = {
                              ...prev.metadata,
                              tenantRef: selectedTenant?.name ?? "",
                              unitLabel: selectedTenant?.unitLabel ?? "",
                              monthlyRent: selectedTenant
                                ? formatAmountForInput(selectedTenant.monthlyRent)
                                : ""
                            };
                            const derivedAmount = deriveRentalAmount(rentalOperationKind, nextMetadata);
                            const descriptionPrefix = rentalOperationKind === "CAUTION" ? "Caution" : "Loyer";
                            return {
                              ...prev,
                              amount: formatAmountForInput(derivedAmount ?? prev.amount),
                              description: selectedTenant
                                ? `${descriptionPrefix} ${selectedTenant.name}`
                                : prev.description,
                              metadata: nextMetadata
                            };
                          });
                        }}
                        required={field.required}
                      >
                        <option value="">-- Choisir un locataire --</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name} — {tenant.unitLabel}
                          </option>
                        ))}
                      </select>
                      {tenants.length === 0 ? (
                        <small className="hint">
                          Aucun locataire enregistré. {referenceView?.view === "tenants"
                            ? <Link to="/finance/transactions?activityCode=RENTAL&view=tenants">Ouvrir les locataires</Link>
                            : "Demandez à un responsable d'ajouter le locataire."}
                        </small>
                      ) : null}
                    </label>
                  );
                }

                if (selectedActivityCode === "GENERAL_STORE" && field.key === "shopRef") {
                  const shopNameValue = transactionForm.metadata.shopRef ?? "";
                  const selectedShopId = shops.find((shop) => shop.name === shopNameValue)?.id ?? "";
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={selectedShopId}
                        onChange={(event) => {
                          const nextShopId = event.target.value;
                          const selectedShop = shops.find((shop) => shop.id === nextShopId);
                          setTransactionForm((prev) => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              shopRef: selectedShop?.name ?? ""
                            }
                          }));
                        }}
                        required={field.required}
                      >
                        <option value="">-- Choisir une boutique --</option>
                        {shops.map((shop) => (
                          <option key={shop.id} value={shop.id}>
                            {shop.name}
                            {shop.location ? ` — ${shop.location}` : ""}
                          </option>
                        ))}
                      </select>
                      {shops.length === 0 ? (
                        <small className="hint">
                          Aucune boutique enregistrée. {referenceView?.view === "shops"
                            ? <Link to="/finance/transactions?activityCode=GENERAL_STORE&view=shops">Ouvrir les boutiques</Link>
                            : "Demandez à un responsable d'ajouter la boutique."}
                        </small>
                      ) : null}
                    </label>
                  );
                }

                if (selectedActivityCode === "BTP" && field.key === "projectRef") {
                  const projectNameValue = transactionForm.metadata.projectRef ?? "";
                  const selectedProjectId =
                    projects.find((project) => project.name === projectNameValue)?.id ?? "";
                  const selectedProject = projects.find((project) => project.name === projectNameValue);
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={selectedProjectId}
                        onChange={(event) => {
                          const nextProjectId = event.target.value;
                          const selectedProjectOption = projects.find(
                            (project) => project.id === nextProjectId
                          );
                          setTransactionForm((prev) => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              projectRef: selectedProjectOption?.name ?? ""
                            }
                          }));
                        }}
                        required={field.required}
                      >
                        <option value="">-- Choisir un chantier --</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      {projects.length === 0 ? (
                        <small className="hint">
                          Aucun chantier enregistré. {referenceView?.view === "projects"
                            ? <Link to="/finance/transactions?activityCode=BTP&view=projects">Ouvrir les chantiers</Link>
                            : "Demandez à un responsable d'ajouter le chantier."}
                        </small>
                      ) : selectedProject ? (
                        <small className="hint">
                          {selectedProject.clientRef ? `Client: ${selectedProject.clientRef}` : ""}
                          {selectedProject.contractRef ? ` | Marché: ${selectedProject.contractRef}` : ""}
                          {selectedProject.location ? ` | Lieu: ${selectedProject.location}` : ""}
                        </small>
                      ) : null}
                    </label>
                  );
                }

                if (selectedActivityCode === "RENTAL" && field.key === "unitLabel") {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <input
                        type="text"
                        value={transactionForm.metadata.unitLabel ?? ""}
                        readOnly
                        disabled
                      />
                    </label>
                  );
                }

                if (selectedActivityCode === "HARDWARE" && field.key === "recipientRef") {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>Remis à / quincaillerie</span>
                      <input
                        type="text"
                        list="hardware-recipients"
                        placeholder="Nom de la personne ou de la quincaillerie"
                        value={transactionForm.metadata.recipientRef ?? ""}
                        onChange={(event) => setTransactionForm((prev) => ({
                          ...prev,
                          metadata: { ...prev.metadata, recipientRef: event.target.value }
                        }))}
                        required={hardwareOperationKind === "ITEM_ENTRY" || hardwareOperationKind === "RECOUVREMENT"}
                      />
                      <datalist id="hardware-recipients">
                        {hardwareRecipients.map((recipient) => <option key={recipient} value={recipient} />)}
                      </datalist>
                      <small className="hint">Utilisez le même nom pour les achats remis et les recouvrements.</small>
                    </label>
                  );
                }

                if (selectedActivityCode === "HARDWARE" && field.key === "itemName") {
                  const itemNameValue = transactionForm.metadata.itemName ?? "";
                  const matchesCatalogArticle = articles.some(
                    (article) => article.name === itemNameValue
                  );
                  const showOtherArticleInput =
                    hardwareCustomArticleMode || (itemNameValue !== "" && !matchesCatalogArticle);
                  const selectValue = showOtherArticleInput
                    ? "__OTHER__"
                    : matchesCatalogArticle
                      ? itemNameValue
                      : "";

                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={selectValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (nextValue === "__OTHER__") {
                            setHardwareCustomArticleMode(true);
                            return;
                          }
                          setHardwareCustomArticleMode(false);
                          setTransactionForm((prev) => {
                            const selectedArticle = articles.find(
                              (article) => article.name === nextValue
                            );
                            const unitPricePatch = deriveHardwareArticleUnitPricePatch(
                              hardwareOperationKind,
                              selectedArticle
                            );
                            const nextMetadata = {
                              ...prev.metadata,
                              itemName: nextValue,
                              ...(unitPricePatch.purchaseUnitPrice
                                ? { purchaseUnitPrice: formatAmountForInput(unitPricePatch.purchaseUnitPrice) }
                                : {}),
                              ...(unitPricePatch.saleUnitPrice
                                ? { saleUnitPrice: formatAmountForInput(unitPricePatch.saleUnitPrice) }
                                : {})
                            };
                            const derivedMargin = deriveHardwareMarginAmount(
                              hardwareOperationKind,
                              nextMetadata,
                              articles
                            );
                            const metadataWithMargin = derivedMargin
                              ? { ...nextMetadata, marginAmount: formatAmountForInput(derivedMargin) }
                              : nextMetadata;
                            const derivedAmount = deriveSectorAmount(
                              "HARDWARE",
                              prev.type,
                              metadataWithMargin
                            );
                            return {
                              ...prev,
                              amount: derivedAmount ? formatAmountForInput(derivedAmount) : prev.amount,
                              metadata: metadataWithMargin
                            };
                          });
                        }}
                        required={field.required}
                      >
                        <option value="">-- Choisir un article --</option>
                        {articles.map((article) => (
                          <option key={article.id} value={article.name}>
                            {article.name}
                          </option>
                        ))}
                        <option value="__OTHER__">Autre (préciser)</option>
                      </select>
                      {showOtherArticleInput ? (
                        <input
                          type="text"
                          placeholder="Nom de l'article"
                          value={itemNameValue}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setTransactionForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                itemName: nextValue
                              }
                            }));
                          }}
                          required={field.required}
                        />
                      ) : null}
                    </label>
                  );
                }

                if (selectedActivityCode === "TRANSPORT" && field.key === "transportCategory") {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={transactionForm.metadata.transportCategory ?? ""}
                        onChange={(event) => {
                          const category = event.target.value;
                          setTransactionForm((prev) => {
                            const operationKind = category === "Camion benne"
                              ? prev.metadata[DUMP_TRUCK_OPERATION_KEY] || (prev.type === "CASH_OUT" ? "DEPENSE" : "TRAVAUX")
                              : "";
                            const nextMetadata = {
                              ...prev.metadata,
                              transportCategory: category,
                              assetType: category,
                              ...(category === "Camion benne"
                                ? { [DUMP_TRUCK_OPERATION_KEY]: operationKind }
                                : {
                                    [DUMP_TRUCK_OPERATION_KEY]: "",
                                    counterpartyRef: "",
                                    quantity: "",
                                    purchaseUnitPrice: "",
                                    amccoAmount: "",
                                    expenseCategory: ""
                                  })
                            };
                            const nextType = operationKind === "VERSEMENT_AMCCO" ||
                              operationKind === "DEPENSE" ||
                              operationKind === "ENTRETIEN" ||
                              operationKind === "CARBURANT"
                              ? "CASH_OUT"
                              : category === "Camion benne" ? "CASH_IN" : prev.type;
                            const derivedAmount = category === "Camion benne"
                              ? deriveSectorAmount("TRANSPORT", nextType, nextMetadata)
                              : null;
                            return {
                              ...prev,
                              type: nextType,
                              amount: derivedAmount
                                ? formatAmountForInput(derivedAmount)
                                : category === "Camion benne" ? "" : nextType !== prev.type ? "" : prev.amount,
                              metadata: nextMetadata
                            };
                          });
                        }}
                        title={field.helpText}
                        required={isFieldRequired}
                      >
                        <option value="">Choisir une catégorie</option>
                        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                        {editingTransactionId && transactionForm.metadata.transportCategory === "Citerne" ? (
                          <option value="Citerne">Citerne (ancien enregistrement)</option>
                        ) : null}
                      </select>
                    </label>
                  );
                }

                if (selectedActivityCode === "TRANSPORT" && field.key === DUMP_TRUCK_OPERATION_KEY) {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{field.label}</span>
                      <select
                        value={transactionForm.metadata[DUMP_TRUCK_OPERATION_KEY] ?? ""}
                        onChange={(event) => {
                          const operationKind = event.target.value;
                          const incoming = ["TRAVAUX", "LOCATION"].includes(operationKind);
                          const outgoing = ["VERSEMENT_AMCCO", "DEPENSE", "ENTRETIEN", "CARBURANT"].includes(operationKind);
                          const workOrRental = operationKind === "TRAVAUX" || operationKind === "LOCATION";
                          const expense = ["DEPENSE", "ENTRETIEN", "CARBURANT"].includes(operationKind);
                          setTransactionForm((prev) => {
                            const nextType = incoming ? "CASH_IN" : outgoing ? "CASH_OUT" : prev.type;
                            const nextMetadata = {
                              ...prev.metadata,
                              [DUMP_TRUCK_OPERATION_KEY]: operationKind,
                              ...(operationKind !== "VERSEMENT_AMCCO" ? { counterpartyRef: "" } : {}),
                              ...(!workOrRental
                                ? { quantity: "", purchaseUnitPrice: "", amccoAmount: "" }
                                : {}),
                              ...(!expense ? { expenseCategory: "" } : {})
                            };
                            const derivedAmount = incoming
                              ? deriveSectorAmount("TRANSPORT", nextType, nextMetadata)
                              : null;
                            return {
                              ...prev,
                              type: nextType,
                              amount: derivedAmount
                                ? formatAmountForInput(derivedAmount)
                                : operationKind === prev.metadata[DUMP_TRUCK_OPERATION_KEY]
                                  ? prev.amount
                                  : "",
                              metadata: nextMetadata
                            };
                          });
                        }}
                        title={field.helpText}
                        required={isFieldRequired}
                      >
                        <option value="">Choisir une opération</option>
                        {field.options?.map((option) => (
                          <option key={option} value={option}>
                            {DUMP_TRUCK_OPERATION_LABELS[option] ?? option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (selectedActivityCode === "HYDROCARBON" && field.key === "counterpartyRef") {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{transactionForm.type === "CASH_OUT" ? "Fournisseur" : "Client"}</span>
                      <input
                        type="text"
                        placeholder={transactionForm.type === "CASH_OUT" ? "Nom du fournisseur" : "Nom du client"}
                        value={transactionForm.metadata[field.key] ?? ""}
                        onChange={(event) => setTransactionForm((prev) => ({
                          ...prev,
                          metadata: { ...prev.metadata, [field.key]: event.target.value }
                        }))}
                        title={field.helpText}
                      />
                    </label>
                  );
                }

                if (field.options?.length) {
                  return (
                    <label key={field.key} className="operations-inline-group">
                      <span>{fieldLabel}</span>
                      <select value={transactionForm.metadata[field.key] ?? ""} onChange={(event) => setTransactionForm((prev) => ({ ...prev, metadata: { ...prev.metadata, [field.key]: event.target.value } }))} title={field.helpText} required={isFieldRequired}>
                        <option value="">Choisir une catégorie</option>
                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  );
                }

                return (
                <label key={field.key} className="operations-inline-group">
                  <span>{fieldLabel}</span>
                  <input
                    type="text"
                    list={selectedActivityCode === "SERVICES" && field.key === "serviceCategory" ? "finance-service-categories" : undefined}
                    inputMode={isMoneyMetadataField(field.key) ? "numeric" : getMetadataInputMode(field.key)}
                    placeholder={field.helpText || field.label}
                    value={transactionForm.metadata[field.key] ?? ""}
                    readOnly={isLegacyBeverageEdit && ["productName", "quantity", "purchaseUnitPrice", "saleUnitPrice"].includes(field.key)}
                    onChange={(event) => {
                      const nextValue = isMoneyMetadataField(field.key)
                        ? formatEditableAmountForInput(event.target.value)
                        : event.target.value;
                      setTransactionForm((prev) => {
                        const nextMetadata = {
                          ...prev.metadata,
                          [field.key]: nextValue
                        };
                        const shouldDeriveAmount =
                          (selectedActivityCode === "HARDWARE" && shouldDeriveHardwareAmount(field.key)) ||
                          (selectedActivityCode === "FOOD" && shouldDeriveFoodAmount(field.key)) ||
                          (selectedActivityCode === "AGRICULTURE" && shouldDeriveAgricultureAmount(field.key)) ||
                          (selectedActivityCode === "BTP" && shouldDeriveBtpAmount(field.key)) ||
                          (selectedActivityCode === "RENTAL" && shouldDeriveRentalAmount(field.key)) ||
                          (selectedActivityCode === "HOTEL_LODGING" && shouldDeriveHotelAmount(field.key)) ||
                          (selectedActivityCode === "WATER" && shouldDeriveWaterAmount(field.key)) ||
                          (selectedActivityCode === "BEVERAGE_DEPOT" && shouldDeriveBeverageAmount(field.key)) ||
                          (selectedActivityCode === "REAL_ESTATE_AGENCY" && shouldDeriveAgencyAmount(field.key)) ||
                          (selectedActivityCode === "FISH_FARMING" && shouldDeriveFishFarmingAmount(field.key)) ||
                          (selectedActivityCode === "LIVESTOCK" && shouldDeriveLivestockAmount(field.key)) ||
                          (selectedActivityCode === "TRANSPORT" &&
                            transactionForm.metadata.transportCategory === "Camion benne" &&
                            shouldDeriveTransportAmount(field.key)) ||
                          (selectedActivityCode === "GENERAL_EXPENSES" && shouldDeriveGeneralExpensesAmount(field.key));
                        const derivedAmount = shouldDeriveAmount
                          ? deriveSectorAmount(selectedActivityCode, prev.type, nextMetadata)
                          : null;
                        const derivedMargin =
                          selectedActivityCode === "HARDWARE" && field.key === "quantity"
                            ? deriveHardwareMarginAmount(hardwareOperationKind, nextMetadata, articles)
                            : null;
                        const finalMetadata = derivedMargin
                          ? { ...nextMetadata, marginAmount: formatAmountForInput(derivedMargin) }
                          : nextMetadata;
                        return {
                          ...prev,
                          amount: derivedAmount ? formatAmountForInput(derivedAmount)
                            : selectedActivityCode === "BEVERAGE_DEPOT" && (beverageOperationKind === "VENTE" || beverageOperationKind === "ACHAT_STOCK") && shouldDeriveAmount && !isLegacyBeverageEdit ? "" : prev.amount,
                          metadata: finalMetadata
                        };
                      });
                    }}
                    onBlur={() => {
                      if (!isMoneyMetadataField(field.key)) {
                        return;
                      }
                      setTransactionForm((prev) => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          [field.key]: formatAmountForInput(prev.metadata[field.key] ?? "")
                        }
                      }));
                    }}
                    title={field.helpText}
                    required={isFieldRequired}
                  />
                </label>
                );
              })}
            </div>
            {selectedActivityCode === "SERVICES" ? (
              <datalist id="finance-service-categories">
                {serviceCategorySuggestions.map((value) => <option key={value} value={value} />)}
              </datalist>
            ) : null}
          </details>

          {transactionWorkspace ? renderTransactionProof() : null}

          <div className="mobile-sticky-form-actions">
            <button
              type="submit"
              disabled={
                accounts.length === 0 ||
                !selectedActivityCode ||
                isLoadingActivities ||
                isSavingTransaction
              }
            >
              {isSavingTransaction ? (
                <>
                  <ButtonSpinner />
                  {transactionProofFile
                    ? "Enregistrement et envoi de la preuve..."
                    : "Enregistrement..."}
                </>
              ) : editingTransactionId ? (
                "Enregistrer les modifications"
              ) : (
                "Enregistrer la transaction"
              )}
            </button>
            {selectedActivityCode === "BEVERAGE_DEPOT" && beverageOperationKind === "VENTE" && !editingTransactionId ? (
              <button type="submit" value="continue-sale" className="secondary-btn"
                disabled={!accounts.length || isLoadingActivities || isSavingTransaction || beverageStock.loading || Boolean(beverageStock.error)}>
                Enregistrer et continuer
              </button>
            ) : null}
            {editingTransactionId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCancelEditTransaction}
                disabled={isSavingTransaction}
              >
                Annuler la modification
              </button>
            ) : null}
          </div>
          </form>);
}
