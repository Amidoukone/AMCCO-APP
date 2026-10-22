import type { Dispatch, SetStateAction, FormEvent } from "react";
import { ButtonSpinner } from "./ButtonSpinner";
import { SectorDirectoryPanel } from "./SectorDirectoryPanel";
import type { BtpProject } from "../types/projects";

type Form = { name: string; clientRef: string; contractRef: string; location: string };
type Props = {
  projects: BtpProject[];
  projectForm: Form;
  setProjectForm: Dispatch<SetStateAction<Form>>;
  editingProjectId: string | null;
  busyProjectId: string | null;
  isSavingProject: boolean;
  isProjectManagementExpanded: boolean;
  setIsProjectManagementExpanded: (value: boolean) => void;
  projectChanges: { isDirty: boolean; onChangeCapture: () => void };
  isLoading: boolean;
  hasLoaded: boolean;
  onReload: () => void;
  handleSaveProject: (event: FormEvent<HTMLFormElement>) => void;
  handleCancelEditProject: () => void;
  handleStartEditProject: (record: BtpProject) => void;
  handleDeleteProject: (record: BtpProject) => void;
};

export function BtpProjectsPanel({
  projects, projectForm, setProjectForm, editingProjectId, busyProjectId, isSavingProject,
  isProjectManagementExpanded, setIsProjectManagementExpanded, projectChanges,
  isLoading, hasLoaded, onReload, handleSaveProject, handleCancelEditProject, handleStartEditProject, handleDeleteProject
}: Props): JSX.Element {
  return (
    <SectorDirectoryPanel
      title="Chantiers" searchLabel="Rechercher un chantier"
      emptyMessage="Aucun chantier enregistré pour le moment." noResultsMessage="Aucun chantier ne correspond à votre recherche."
      records={projects} getSearchValues={(record) => [record.name, record.clientRef, record.contractRef, record.location]}
      renderDetails={(record) => (<>{record.clientRef ? <p className="hint">Client: {record.clientRef}</p> : null}{record.contractRef ? <p className="hint">Marché: {record.contractRef}</p> : null}{record.location ? <p className="hint">{record.location}</p> : null}</>)}
      busyId={busyProjectId} isSaving={isSavingProject} isLoading={isLoading} hasLoaded={hasLoaded}
      onReload={onReload} onEdit={handleStartEditProject} onDelete={handleDeleteProject}
      sectionId="project-management" formTitle={editingProjectId ? "Modifier un chantier" : "Ajouter un chantier"}
      formDescription="Chantiers du secteur actif."
      isExpanded={isProjectManagementExpanded} onExpandedChange={setIsProjectManagementExpanded}
    >
      <form className="finance-account-form" onSubmit={handleSaveProject} onChangeCapture={projectChanges.onChangeCapture} data-unsaved-sector-form={projectChanges.isDirty ? "true" : undefined}>
        <label className="operations-inline-group">
          <span>Nom du chantier</span>
          <input
            type="text"
            placeholder="Ex: Chantier Kalaban"
            value={projectForm.name}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                name: event.target.value
              }))
            }
            required
          />
        </label>
        <label className="operations-inline-group">
          <span>Client / maitre d'ouvrage</span>
          <input
            type="text"
            placeholder="Optionnel"
            value={projectForm.clientRef}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                clientRef: event.target.value
              }))
            }
          />
        </label>
        <label className="operations-inline-group">
          <span>Marché / devis</span>
          <input
            type="text"
            placeholder="Optionnel, ex: DEV-2026-10"
            value={projectForm.contractRef}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                contractRef: event.target.value
              }))
            }
          />
        </label>
        <label className="operations-inline-group">
          <span>Localisation</span>
          <input
            type="text"
            placeholder="Optionnel, ex: Kalaban"
            value={projectForm.location}
            onChange={(event) =>
              setProjectForm((prev) => ({
                ...prev,
                location: event.target.value
              }))
            }
          />
        </label>
        <div className="mobile-sticky-form-actions">
          <button type="submit" disabled={isSavingProject}>
            {isSavingProject ? (
              <>
                <ButtonSpinner />
                Enregistrement...
              </>
            ) : editingProjectId ? (
              "Enregistrer les modifications"
            ) : (
              "Ajouter le chantier"
            )}
          </button>
          {editingProjectId ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCancelEditProject}
              disabled={isSavingProject}
            >
              Annuler la modification
            </button>
          ) : null}
        </div>
      </form>
    </SectorDirectoryPanel>
  );
}
