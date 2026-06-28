import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { useSetPin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, KeyRound, User as UserIcon, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const setPinMutation = useSetPin();

  const handleSetPin = () => {
    if (pin.length < 4 || pin.length > 8) {
      toast({ title: "PIN must be between 4 and 8 digits", variant: "destructive" });
      return;
    }
    setPinMutation.mutate(
      { data: { pin } },
      {
        onSuccess: () => {
          toast({ title: "Admin PIN updated successfully" });
          setPin("");
          if (user) {
            queryClient.setQueryData(getGetMeQueryKey(), { ...user, hasPin: true });
          }
        },
        onError: () => {
          toast({ title: "Failed to update PIN", variant: "destructive" });
        }
      }
    );
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account and security preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
            <div>
              <p className="font-medium">{user.displayName || "User"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="capitalize">{user.role}</Badge>
              {user.tier === 'premium' ? (
                <Badge className="bg-primary text-primary-foreground gap-1"><Crown className="w-3 h-3"/> Premium</Badge>
              ) : (
                <Badge variant="secondary">Free</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {user.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Security PIN
            </CardTitle>
            <CardDescription>
              Your PIN is used to unlock Unfiltered Mode during playback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4 max-w-sm">
              <div className="grid gap-2 flex-1">
                <label className="text-sm font-medium">New PIN (4-8 digits)</label>
                <Input 
                  type="password" 
                  placeholder="Enter new PIN" 
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </div>
              <Button onClick={handleSetPin} disabled={setPinMutation.isPending || pin.length < 4}>
                {user.hasPin ? "Update PIN" : "Set PIN"}
              </Button>
            </div>
            {user.hasPin && (
              <p className="text-sm flex items-center gap-1 text-safe mt-2">
                <Shield className="w-4 h-4" /> PIN is currently set and active.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
