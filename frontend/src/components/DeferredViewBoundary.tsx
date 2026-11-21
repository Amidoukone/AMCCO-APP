import { Component, type ReactNode } from "react";

// A failed optional view must leave the rest of the page usable. Browsers can
// cache failed module imports, so offer an explicit page reload instead of a
// retry that would keep returning the same rejected import. The fallback keeps
// the draft marker so the shared reload/navigation guard remains active.
export class DeferredViewBoundary extends Component<{ children: ReactNode; hasUnsavedChanges?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" data-unsaved-sector-form={this.props.hasUnsavedChanges ? "true" : undefined}>
        <p>Impossible d’afficher cette partie de la page. Vérifiez la connexion puis rechargez la page.</p>
        <button type="button" className="secondary-btn" onClick={this.reload}>Recharger la page</button>
      </div>
    );
  }
}
