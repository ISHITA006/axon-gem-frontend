import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CatalogViewerAuthProvider, useCatalogViewerAuth } from "@/contexts/CatalogViewerAuthContext";
import { GenerationQueueProvider } from "@/contexts/GenerationQueueContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import CatalogueLogin from "./pages/CatalogueLogin";
import CatalogueBrowse from "./pages/CatalogueBrowse";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <GenerationQueueProvider>{children}</GenerationQueueProvider>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function CatalogViewerRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useCatalogViewerAuth();
  if (!isAuthenticated) return <Navigate to="/catalogue/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CatalogViewerAuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
              <Route path="/catalogue/login" element={<CatalogueLogin />} />
              <Route
                path="/catalogue"
                element={
                  <CatalogViewerRoute>
                    <CatalogueBrowse />
                  </CatalogViewerRoute>
                }
              />
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </CatalogViewerAuthProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
