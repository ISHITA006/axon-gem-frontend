import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "catalog_view_token";

type CatalogViewerAuthContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  login: (accessToken: string) => void;
  logout: () => void;
};

const CatalogViewerAuthContext = createContext<CatalogViewerAuthContextValue | null>(null);

export function CatalogViewerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const value = useMemo<CatalogViewerAuthContextValue>(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login: (accessToken: string) => {
        localStorage.setItem(STORAGE_KEY, accessToken);
        setToken(accessToken);
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
      },
    }),
    [token],
  );

  return (
    <CatalogViewerAuthContext.Provider value={value}>{children}</CatalogViewerAuthContext.Provider>
  );
}

export function useCatalogViewerAuth() {
  const ctx = useContext(CatalogViewerAuthContext);
  if (!ctx) throw new Error("useCatalogViewerAuth must be used within CatalogViewerAuthProvider");
  return ctx;
}
