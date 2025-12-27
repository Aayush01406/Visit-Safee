import React, { Suspense, lazy } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedRoute({ 
  component: Component, 
  role,
  params
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  // Validate Society Name
  if (params?.societyName) {
      const decodedSocietyName = decodeURIComponent(params.societyName);
      // Check if user belongs to this society (optional but good for security/UX)
      if (user.residencyName && user.residencyName !== decodedSocietyName) {
         // Redirect to their own society
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
    // Redirect to their appropriate dashboard if they try to access wrong one
    const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
    
    if (user.role === 'admin') return <Redirect to={`${societyPath}/admin`} />;
    if (user.role === 'guard') return <Redirect to={`${societyPath}/guard`} />;
    if (user.role === 'resident') {
         const flatPath = user.flatNumber ? `/${user.flatNumber}` : "";
         return <Redirect to={`${societyPath}/resident${flatPath}`} />;
    }
    return <Redirect to="/login" />;
  }
  
  // For resident, validate flat number if present in URL
  if (role === 'resident') {
      const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
      
      // If flat number is in URL, ensure it matches user's flat
      if (params?.flatNumber) {
          if (user.flatNumber && user.flatNumber !== params.flatNumber) {
              return <Redirect to={`${societyPath}/resident/${user.flatNumber}`} />;
          }
      } 
      // If flat number is NOT in URL but user has one, redirect to specific flat URL
      else if (user.flatNumber) {
          return <Redirect to={`${societyPath}/resident/${user.flatNumber}`} />;
      }
  }

  return <Component {...params} />;
}

function LegacyRoute({ role, pathSuffix = "" }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  
  if (user && (user.role === role || role === 'any')) {
      const societyPath = user.residencyName ? `/${encodeURIComponent(user.residencyName)}` : "";
      const rolePath = user.role === 'resident' ? '/resident' : `/${user.role}`;
      // Use explicit path suffix if provided, otherwise default to role path
      const targetPath = pathSuffix ? `/${role}${pathSuffix}` : rolePath;
      return <Redirect to={`${societyPath}${targetPath}`} />;
  }
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        {/* Public Routes */}
        <Route path="/" component={() => {
          const { user, isLoading } = useAuth();
          if (isLoading) return <LoadingSpinner />;
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
      
      {/* Dynamic Visitor Form */}
      <Route path="/:societyName/visitor-form">
        {(params) => <VisitorForm residencyName={params.societyName} />}
      </Route>
      {/* Legacy Visitor Form */}
      <Route path="/visitor-form/:residencyName">
        {(params) => <VisitorForm residencyName={params.residencyName} />}
      </Route>
      
      <Route path="/visitor-success" component={VisitorStatus} />

      {/* Protected Routes */}
      <Route path="/:societyName/resident/:flatNumber">
        {(params) => <ProtectedRoute component={ResidentDashboard} role="resident" params={params} />}
      </Route>
      
      {/* Handle resident root without flat number - ProtectedRoute will redirect */}
      <Route path="/:societyName/resident">
        {(params) => <ProtectedRoute component={ResidentDashboard} role="resident" params={params} />}
      </Route>

      <Route path="/:societyName/guard">
        {(params) => <ProtectedRoute component={GuardDashboard} role="guard" params={params} />}
      </Route>
      <Route path="/:societyName/admin">
        {(params) => <ProtectedRoute component={AdminDashboard} role="admin" params={params} />}
      </Route>
      <Route path="/:societyName/admin/management">
        {(params) => <ProtectedRoute component={AdminManagement} role="admin" params={params} />}
      </Route>

      {/* Legacy Routes Redirects */}
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
