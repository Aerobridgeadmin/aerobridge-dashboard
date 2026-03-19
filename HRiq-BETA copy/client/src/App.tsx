import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import NotFound from "@/pages/not-found";
import HRIQ from "@/pages/hriq";
import AdminUsers from "@/pages/admin-users";
import Login from "@/pages/login";

function ProtectedHRIQ() {
  return <ProtectedRoute><HRIQ /></ProtectedRoute>;
}

function ProtectedAdminUsers() {
  return <ProtectedRoute><AdminUsers /></ProtectedRoute>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/hriq" component={ProtectedHRIQ} />
      <Route path="/admin/users" component={ProtectedAdminUsers} />
      
      <Route path="/">{() => <Redirect to="/hriq" />}</Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="resume-scorer-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
