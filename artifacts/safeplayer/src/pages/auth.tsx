import { useAuth } from "@/lib/auth";
import { Redirect, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { useLogin, useRegister, useForgotPassword, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, ArrowLeft, Copy, CheckCircle2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "viewer"]),
  displayName: z.string().optional(),
});

export default function AuthPage() {
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const forgotMutation = useForgotPassword();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", role: "viewer", displayName: "" },
  });

  if (user) {
    return <Redirect to={user.role === "admin" ? "/admin" : "/dashboard"} />;
  }

  function onLoginSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data.user, data.token);
          setLocation(data.user.role === "admin" ? "/admin" : "/dashboard");
        },
        onError: () => {
          toast({
            title: "Login failed",
            description: "Invalid credentials. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }

  function onRegisterSubmit(values: z.infer<typeof registerSchema>) {
    registerMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data.user, data.token);
          setLocation(data.user.role === "admin" ? "/admin" : "/dashboard");
        },
        onError: async (err: any) => {
          let description = "Could not create account.";
          try {
            const body = await err?.response?.json?.() ?? {};
            if (body?.error === "ADMIN_LIMIT_REACHED") {
              description = body.message ?? "Maximum 2 administrator accounts allowed.";
            } else if (body?.error === "Email already registered") {
              description = "An account with this email already exists.";
            }
          } catch {}
          toast({ title: "Registration failed", description, variant: "destructive" });
        },
      }
    );
  }

  function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail) return;
    forgotMutation.mutate(
      { data: { email: forgotEmail } },
      {
        onSuccess: (data) => {
          setResetUrl(data.resetUrl);
        },
        onError: async (err: any) => {
          let description = "Something went wrong. Please try again.";
          try {
            const body = await err?.response?.json?.() ?? {};
            if (body?.error) description = body.error;
          } catch {}
          toast({ title: "Could not generate reset link", description, variant: "destructive" });
        },
      }
    );
  }

  function handleCopy() {
    if (!resetUrl) return;
    navigator.clipboard.writeText(resetUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleForgotClose() {
    setForgotOpen(false);
    setForgotEmail("");
    setResetUrl(null);
    setCopied(false);
    forgotMutation.reset();
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">SafePlayer</h1>
          <p className="text-muted-foreground">Vigilant co-pilot for family media</p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Browse without signing in
          </a>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign In</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Enter your credentials to access your library</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="admin@family.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                      {loginMutation.isPending ? "Signing in..." : "Sign in"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setForgotOpen(true)}
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
                    >
                      Forgot password?
                    </button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Create an account</CardTitle>
                <CardDescription>Set up a new family workspace</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="name@example.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Min 8 characters" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Dad" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="admin">Administrator (Parent)</SelectItem>
                              <SelectItem value="viewer">Viewer (Child)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? "Creating..." : "Create workspace"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={(open) => { if (!open) handleForgotClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" /> Password Reset
            </DialogTitle>
            <DialogDescription>
              {resetUrl
                ? "Copy this link and open it in a browser to set a new password. It expires in 1 hour."
                : "Enter the email address for the account. A reset link will be generated for you to share."}
            </DialogDescription>
          </DialogHeader>

          {!resetUrl ? (
            <form onSubmit={handleForgotSubmit} className="space-y-4 mt-1">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email address</label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={forgotMutation.isPending || !forgotEmail}
              >
                {forgotMutation.isPending ? "Generating…" : "Generate reset link"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 mt-1">
              <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reset link</p>
                <p className="text-xs break-all font-mono text-foreground leading-relaxed">{resetUrl}</p>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleCopy}
                variant={copied ? "secondary" : "default"}
              >
                {copied ? (
                  <><CheckCircle2 className="w-4 h-4" /> Copied!</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy reset link</>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Open this link in the user's browser to set a new password.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
