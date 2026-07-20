import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useState } from "react";
import {
  useGetAdminDashboard, getGetAdminDashboardQueryKey,
  useListUsers, getListUsersQueryKey,
  useListSubmissions, useListFlaggedContent,
  useApproveSubmission, useRejectSubmission, getListSubmissionsQueryKey,
  useDeleteUser,
  useForgotPassword,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Film, Flag, CheckCircle2, XCircle, AlertTriangle, Activity, KeyRound, Trash2, Link as LinkIcon, Copy } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<{ id: number; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Delete user confirmation state
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);

  // Reset link dialog state
  const [resetLinkEmail, setResetLinkEmail] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // All hooks called unconditionally before any early return
  const { data: stats } = useGetAdminDashboard();
  const { data: users } = useListUsers();
  const { data: submissions } = useListSubmissions({ status: "pending" });
  const { data: flagged } = useListFlaggedContent();
  const approveMutation = useApproveSubmission();
  const rejectMutation = useRejectSubmission();
  const deleteUserMutation = useDeleteUser();
  const forgotMutation = useForgotPassword();

  if (!user || user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  async function handleResetPassword() {
    if (!resetTarget || newPassword.length < 8) return;
    setIsResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error ?? "Failed");
      }
      toast({ title: `Password reset for ${resetTarget.email}` });
      setResetTarget(null);
      setNewPassword("");
    } catch (e: unknown) {
      toast({ title: e instanceof Error ? e.message : "Reset failed", variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
  }

  function handleGenerateResetLink(email: string) {
    setResetLinkEmail(email);
    setResetLink(null);
    setLinkCopied(false);
    forgotMutation.mutate(
      { data: { email } },
      {
        onSuccess: (data) => setResetLink(data.resetUrl),
        onError: async (err: any) => {
          let description = "Could not generate link.";
          try { const b = await err?.response?.json?.() ?? {}; if (b.error) description = b.error; } catch {}
          toast({ title: "Failed", description, variant: "destructive" });
          setResetLinkEmail(null);
        },
      }
    );
  }

  function handleCopyLink() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  function handleDeleteUser(id: number) {
    deleteUserMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          toast({ title: "Account deleted" });
          setDeleteTarget(null);
        },
        onError: async (err: any) => {
          let description = "Could not delete account.";
          try { const b = await err?.response?.json?.() ?? {}; if (b.error) description = b.error; } catch {}
          toast({ title: "Delete failed", description, variant: "destructive" });
          setDeleteTarget(null);
        },
      }
    );
  }

  const handleApprove = (id: number) => {
    approveMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey({ status: "pending" }) });
          toast({ title: "Submission approved" });
        },
      }
    );
  };

  const handleReject = (id: number) => {
    rejectMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey({ status: "pending" }) });
          toast({ title: "Submission rejected — jump frames removed and media reset to unpreviewed" });
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Control Room</h1>
        <p className="text-muted-foreground mt-1">Manage users, content safety, and submissions.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Media</CardTitle>
            <Film className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalMedia || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-warning">Pending Submissions</CardTitle>
            <Flag className="w-4 h-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats?.pendingSubmissions || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-danger">Flagged Content</CardTitle>
            <AlertTriangle className="w-4 h-4 text-danger" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">{stats?.flaggedCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="submissions" className="w-full">
        <TabsList>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="flagged">Flagged Content</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Skip Frames</CardTitle>
              <CardDescription>
                Review skip frames submitted by users. Rejecting a submission removes its frames from the media and resets its safety status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Media</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Submitted By</TableHead>
                    <TableHead>AI Check</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No pending submissions.</TableCell>
                    </TableRow>
                  ) : (
                    submissions?.map(sub => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.mediaTitle || `Media #${sub.mediaId}`}</TableCell>
                        <TableCell className="whitespace-nowrap">{sub.startTime}s – {sub.endTime}s</TableCell>
                        <TableCell className="capitalize">{sub.category}</TableCell>
                        <TableCell>
                          {sub.submitterEmail ? (
                            <span className="text-sm font-medium">{sub.submitterEmail}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.aiFlag?.flagged ? (
                            <Badge variant="destructive" className="flex w-max items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Flagged
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-safe border-safe flex w-max items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Clean
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="text-safe hover:text-safe hover:bg-safe/10" onClick={() => handleApprove(sub.id)} disabled={approveMutation.isPending}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-danger hover:text-danger hover:bg-danger/10" onClick={() => handleReject(sub.id)} disabled={rejectMutation.isPending}>
                              <XCircle className="w-4 h-4 mr-1" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage viewer accounts. Admin accounts are protected from deletion.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.displayName || "-"}</TableCell>
                      <TableCell className="capitalize">{u.role}</TableCell>
                      <TableCell>
                        {u.tier === 'premium' ? (
                          <Badge className="bg-primary text-primary-foreground">Premium</Badge>
                        ) : (
                          <Badge variant="secondary">Free</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => handleGenerateResetLink(u.email)}
                            disabled={forgotMutation.isPending && resetLinkEmail === u.email}
                          >
                            <LinkIcon className="w-3.5 h-3.5" /> Reset Link
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => { setResetTarget({ id: u.id, email: u.email }); setNewPassword(""); }}
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset PW
                          </Button>
                          {u.role !== "admin" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-danger hover:text-danger hover:bg-danger/10"
                              onClick={() => setDeleteTarget({ id: u.id, email: u.email })}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Reset Password Dialog */}
          <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Set a new password for <strong>{resetTarget?.email}</strong>.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                />
                <Button
                  onClick={handleResetPassword}
                  disabled={isResetting || newPassword.length < 8}
                  className="w-full"
                >
                  {isResetting ? "Resetting…" : "Set New Password"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Generate Reset Link Dialog */}
          <Dialog open={!!resetLinkEmail} onOpenChange={(open) => { if (!open) { setResetLinkEmail(null); setResetLink(null); setLinkCopied(false); } }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-primary" /> Password Reset Link
                </DialogTitle>
                <DialogDescription>
                  {resetLink
                    ? `Copy this link and share it with ${resetLinkEmail}. It expires in 1 hour.`
                    : `Generating reset link for ${resetLinkEmail}…`}
                </DialogDescription>
              </DialogHeader>
              {resetLink && (
                <div className="space-y-4 mt-1">
                  <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reset link</p>
                    <p className="text-xs break-all font-mono text-foreground leading-relaxed">{resetLink}</p>
                  </div>
                  <Button className="w-full gap-2" onClick={handleCopyLink} variant={linkCopied ? "secondary" : "default"}>
                    {linkCopied ? <><CheckCircle2 className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy link</>}
                  </Button>
                </div>
              )}
              {!resetLink && forgotMutation.isPending && (
                <div className="py-4 flex justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Delete User Confirmation */}
          <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-danger">
                  <Trash2 className="w-4 h-4" /> Delete account?
                </DialogTitle>
                <DialogDescription>
                  This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deleteUserMutation.isPending}
                  onClick={() => deleteTarget && handleDeleteUser(deleteTarget.id)}
                >
                  {deleteUserMutation.isPending ? "Deleting…" : "Yes, delete"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="flagged" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Flagged Content</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flagged?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No flagged content.</TableCell>
                    </TableRow>
                  ) : (
                    flagged?.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="capitalize">{f.type}</TableCell>
                        <TableCell>
                          <Badge variant={f.severity === 'extreme' || f.severity === 'high' ? 'destructive' : 'secondary'} className="capitalize">
                            {f.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>{f.reason}</TableCell>
                        <TableCell>{new Date(f.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
