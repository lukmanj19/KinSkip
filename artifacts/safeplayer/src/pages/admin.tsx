import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useGetAdminDashboard, getGetAdminDashboardQueryKey, useListUsers, useListSubmissions, useListFlaggedContent, useApproveSubmission, useRejectSubmission, getListSubmissionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Film, Flag, CheckCircle2, XCircle, AlertTriangle, Activity } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!user || user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  const { data: stats } = useGetAdminDashboard();
  const { data: users } = useListUsers();
  const { data: submissions } = useListSubmissions({ status: "pending" });
  const { data: flagged } = useListFlaggedContent();

  const approveMutation = useApproveSubmission();
  const rejectMutation = useRejectSubmission();

  const handleApprove = (id: number) => {
    approveMutation.mutate(
      { submissionId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey({ status: "pending" }) });
          toast({ title: "Submission approved" });
        }
      }
    );
  };

  const handleReject = (id: number) => {
    rejectMutation.mutate(
      { submissionId: id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey({ status: "pending" }) });
          toast({ title: "Submission rejected" });
        }
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
              <CardDescription>Review skip frames submitted by users.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Media</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>AI Check</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No pending submissions.</TableCell>
                    </TableRow>
                  ) : (
                    submissions?.map(sub => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.mediaTitle || `Media #${sub.mediaId}`}</TableCell>
                        <TableCell>{sub.startTime}s - {sub.endTime}s</TableCell>
                        <TableCell className="capitalize">{sub.category}</TableCell>
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
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Tier</TableHead>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
