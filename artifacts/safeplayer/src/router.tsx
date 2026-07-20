import { Switch, Route } from "wouter";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import AdminDashboard from "@/pages/admin";
import Player from "@/pages/player";
import Settings from "@/pages/settings";
import ResetPassword from "@/pages/reset-password";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

export default function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={AuthPage} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/player/:id" component={Player} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}
