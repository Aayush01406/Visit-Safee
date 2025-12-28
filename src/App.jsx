import React, { Suspense, lazy, useState, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, AuthProvider } from "@/hooks/use-auth.jsx";
import { Loader2 } from "lucide-react";

const NotFound = lazy(() => import("@/pages/not-found"));
const VisitorForm = lazy(() => import("@/pages/VisitorForm"));
const VisitorStatus = lazy(() => import("@/pages/VisitorStatus"));
const Login = lazy(() => import("@/pages/Login"));
const RegisterResidency = lazy(() => import("@/pages/RegisterResidency"));
const ResidentDashboard = lazy(() => import("@/pages/ResidentDashboard"));
const GuardDashboard = lazy(() => import("@/pages/GuardDashboard"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminManagement = lazy(() => import("@/pages/AdminManagement"));
const OwnerLogin = lazy(() => import("@/pages/OwnerLogin"));
const OwnerDashboard = lazy(() => import("@/pages/OwnerDashboard"));
const Maintenance = lazy(() => import("@/pages/Maintenance"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function WithMaintenanceCheck({ societyName, children }) {
  const { data: status, isLoading } = useQuery({
    queryKey: ["residencyStatus", societyName],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/residencyStatus?societyName=${encodeURIComponent(societyName)}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        return data.serviceStatus;
      } catch (e) {
        console.error("Failed to fetch residency status", e);
        return "ON";
      }
    },
    refetchInterval: 3000, // Poll every 3 seconds for real-time updates
  });

  if (isLoading) return <LoadingSpinner />;
  if (status === "OFF") return <Maintenance residencyName={societyName} />;
  
  return children;
}

function ProtectedRoute({ 
  component: Component, 
  role,
  params
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (params?.societyName) {
      const decodedSocietyName = decodeURIComponent(params.societyName);
      if (user.residencyName && user.residencyName !== decodedSocietyName) {
         const correctSocietyPath = `/${encodeURIComponent(user.residencyName)}`;
         if (user.role === 'admin') return <Redirect to={`${correctSocietyPath}/admin`} />;
         if (user.role === 'guard') return <Redirect to={`${correctSocietyPath}/guard`} />;
         if (user.role === 'resident') {
             const flatPath = user.flatNumber ? `/${user.flatNumber}` : "";
             return <Redirect to={`${correctSocietyPath}/resident${flatPath}`} />;
         }
      }
  }

  if (role && user.role !== role) {
    const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
    
    if (user.role === 'admin') return <Redirect to={`${societyPath}/admin`} />;
    if (user.role === 'guard') return <Redirect to={`${societyPath}/guard`} />;
    if (user.role === 'resident') {
         const flatPath = user.flatNumber ? `/${user.flatNumber}` : "";
         return <Redirect to={`${societyPath}/resident${flatPath}`} />;
    }
    return <Redirect to="/login" />;
  }
  
  if (role === 'resident') {
      const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
      if (params?.flatNumber) {
          if (user.flatNumber && user.flatNumber !== params.flatNumber) {
              return <Redirect to={`${societyPath}/resident/${user.flatNumber}`} />;
          }
      } else if (user.flatNumber) {
          return <Redirect to={`${societyPath}/resident/${user.flatNumber}`} />;
      }
  }

  return <Component {...params} />;
}

function LegacyRoute({ role, pathSuffix = "" }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  
  if (user && (user.role === role || role === 'any')) {
      const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
      const rolePath = user.role === 'resident' ? '/resident' : `/${user.role}`;
      const targetPath = pathSuffix ? `/${role}${pathSuffix}` : rolePath;
      return <Redirect to={`${societyPath}${targetPath}`} />;
  }
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/" component={() => {
          const { user, loading } = useAuth();
          if (loading) return <LoadingSpinner />;
          if (user) {
            const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
            if (user.role === 'admin') return <Redirect to={`${societyPath}/admin`} />;
            if (user.role === 'guard') return <Redirect to={`${societyPath}/guard`} />;
            if (user.role === 'resident') {
                const flatPath = user.flatNumber ? `/${user.flatNumber}` : "";
                return <Redirect to={`${societyPath}/resident${flatPath}`} />;
            }
          }
          return <Redirect to="/login" />;
        }} />
        <Route path="/login" component={Login} />
        <Route path="/register-residency" component={RegisterResidency} />
        
        {/* Owner Routes */}
        <Route path="/owner-login" component={OwnerLogin} />
        <Route path="/Owner/:ownerName">
            {(params) => <OwnerDashboard ownerName={params.ownerName} />}
        </Route>
      
      <Route path="/:societyName/visitor-form">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <VisitorForm residencyName={params.societyName} />
            </WithMaintenanceCheck>
        )}
      </Route>
      <Route path="/visitor-form/:residencyName">
        {(params) => (
            <WithMaintenanceCheck societyName={params.residencyName}>
                <VisitorForm residencyName={params.residencyName} />
            </WithMaintenanceCheck>
        )}
      </Route>
      
      <Route path="/visitor-success" component={VisitorStatus} />

      <Route path="/:societyName/resident/:flatNumber">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <ProtectedRoute component={ResidentDashboard} role="resident" params={params} />
            </WithMaintenanceCheck>
        )}
      </Route>
      
      <Route path="/:societyName/resident">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <ProtectedRoute component={ResidentDashboard} role="resident" params={params} />
            </WithMaintenanceCheck>
        )}
      </Route>

      <Route path="/:societyName/guard">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <ProtectedRoute component={GuardDashboard} role="guard" params={params} />
            </WithMaintenanceCheck>
        )}
      </Route>
      <Route path="/:societyName/admin">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <ProtectedRoute component={AdminDashboard} role="admin" params={params} />
            </WithMaintenanceCheck>
        )}
      </Route>
      <Route path="/:societyName/admin/management">
        {(params) => (
            <WithMaintenanceCheck societyName={params.societyName}>
                <ProtectedRoute component={AdminManagement} role="admin" params={params} />
            </WithMaintenanceCheck>
        )}
      </Route>

      <Route path="/resident" component={() => <LegacyRoute role="resident" />} />
      <Route path="/guard" component={() => <LegacyRoute role="guard" />} />
      <Route path="/admin" component={() => <LegacyRoute role="admin" />} />
      <Route path="/admin/management" component={() => <LegacyRoute role="admin" pathSuffix="/management" />} />

      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
