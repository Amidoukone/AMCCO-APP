import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "../../frontend/src/context/AuthContext";
import { useAuthorizedRequest } from "../../frontend/src/lib/useAuthorizedRequest";
import { useActionScope } from "../../frontend/src/lib/useActionScope";
import { DeferredViewBoundary } from "../../frontend/src/components/DeferredViewBoundary";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useUnsavedChangesGuard } from "../../frontend/src/lib/useUnsavedChangesGuard";

let current: { auth: ReturnType<typeof useAuth>; authorized: ReturnType<typeof useAuthorizedRequest> } | null = null;
function Probe() {
  current = { auth: useAuth(), authorized: useAuthorizedRequest() };
  return null;
}
export function mount(element: HTMLElement): () => void {
  const root = createRoot(element);
  root.render(<AuthProvider><Probe /></AuthProvider>);
  return () => { root.unmount(); current = null; };
}
export function getProbe() {
  if (!current) throw new Error("Authentication test probe not mounted");
  return current;
}

let captureScope: ReturnType<typeof useActionScope> | null = null;
function ScopeProbe({ scope }: { scope: string }) {
  captureScope = useActionScope(scope);
  return <p>{scope}</p>;
}
export function mountScopeProbe(element: HTMLElement) {
  const root = createRoot(element);
  return {
    show: (scope: string) => root.render(<ScopeProbe scope={scope} />),
    capture: () => { if (!captureScope) throw new Error("Scope probe not mounted"); return captureScope(); },
    unmount: () => { root.unmount(); captureScope = null; }
  };
}
function BrokenView(): JSX.Element { throw new Error("Simulated optional view failure"); }
function GuardedBrokenView({ dirty }: { dirty: boolean }) {
  const { dialog } = useUnsavedChangesGuard();
  return <>{dialog}<DeferredViewBoundary hasUnsavedChanges={dirty}><BrokenView /></DeferredViewBoundary></>;
}
export function mountBrokenView(element: HTMLElement, dirty: boolean): () => void {
  const root = createRoot(element);
  const router = createMemoryRouter([{ path: "/", element: <GuardedBrokenView dirty={dirty} /> }]);
  root.render(<RouterProvider router={router} />);
  return () => root.unmount();
}
