import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const resetMutation = useResetPassword();

  // Extract token from ?token=xxx
  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token") ?? ""
    : "";

  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const canSubmit = newPassword.length >= 8 && newPassword === confirm && token.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    resetMutation.mutate(
      { data: { token, newPassword } },
      {
        onSuccess: () => {
          setDone(true);
          toast({ title: "Password updated", description: "You can now sign in with your new password." });
          setTimeout(() => setLocation("/"), 2500);
        },
        onError: async (err: any) => {
          let description = "The reset link may have expired or already been used.";
          try {
            const body = await err?.response?.json?.() ?? {};
            if (body?.error) description = body.error;
          } catch {}
          toast({ title: "Reset failed", description, variant: "destructive" });
        },
      }
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <AlertTriangle className="h-12 w-12 text-warning" />
            <div>
              <h2 className="text-xl font-bold">Invalid link</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This reset link is missing a token. Please use the link exactly as provided.
              </p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/")}>Back to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-safe" />
            <div>
              <h2 className="text-xl font-bold">Password updated!</h2>
              <p className="text-sm text-muted-foreground mt-1">Redirecting you to sign in…</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
          <p className="text-muted-foreground text-sm">Enter a new password for your account.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New password</CardTitle>
            <CardDescription>Must be at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">New password</label>
                <Input
                  type="password"
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm password</label>
                <Input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={mismatch ? "border-destructive" : ""}
                />
                {mismatch && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!canSubmit || resetMutation.isPending}
              >
                {resetMutation.isPending ? "Updating…" : "Set new password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
