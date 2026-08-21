import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Shield, Home, Settings, LayoutDashboard, LogOut, LogIn, UserPlus, WifiOff, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SettingsPanel } from "@/components/settings-panel";

/** Global network status hook — listens to browser online/offline events. */
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 3000);
      return () => clearTimeout(t);
    };
    const goOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { isOnline, justReconnected };
}

/** Sticky banner shown at the very top whenever the device goes offline (or just reconnected). */
function NetworkBanner() {
  const { isOnline, justReconnected } = useOnlineStatus();

  if (isOnline && !justReconnected) return null;

  if (!isOnline) {
    return (
      <div className="w-full bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-50">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>No internet connection — streaming unavailable. Local files continue to work.</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-safe text-safe-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-50">
      <Wifi className="w-4 h-4 shrink-0" />
      <span>Back online</span>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
        setLocation("/");
      },
    });
  };

  // Guest layout — minimal top bar with sign-in / register links
  if (!user) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <NetworkBanner />
        <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight text-sm">SafePlayer</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link href="/"><LogIn className="h-4 w-4" /> Sign In</Link>
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href="/?tab=register"><UserPlus className="h-4 w-4" /> Register</Link>
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    );
  }

  const navItems =
    user.role === "admin"
      ? [
          { label: "Admin", href: "/admin", icon: LayoutDashboard },
          { label: "Library", href: "/dashboard", icon: Home },
          { label: "Community", href: "/community", icon: Trophy },
        ]
      : [
          { label: "Library", href: "/dashboard", icon: Home },
          { label: "Community", href: "/community", icon: Trophy },
        ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Full-width network banner — above everything */}
      <NetworkBanner />

      <div className="flex flex-col md:flex-row flex-1">
        {/* Sidebar / Topbar */}
        <nav className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-card p-4 flex flex-row md:flex-col justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2 px-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold tracking-tight">SafePlayer</span>
          </div>

          <div className="flex md:flex-col gap-2 flex-1 md:mt-8 overflow-x-auto md:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "secondary" : "ghost"}
                  className={`justify-start gap-2 ${isActive ? "bg-secondary text-secondary-foreground" : ""}`}
                  asChild
                >
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                </Button>
              );
            })}

            {/* Settings — opens as overlay Sheet, never navigates away */}
            <Button
              variant="ghost"
              className="justify-start gap-2"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden md:inline">Settings</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border hidden md:flex">
            <div className="flex flex-col flex-1 truncate">
              <span className="text-sm font-medium truncate">{user.displayName || user.email}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{user.role}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 md:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Settings Sheet — floats over all content, video keeps playing */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between pb-4 border-b mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" /> Settings
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2"
              onClick={() => setSettingsOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </SheetHeader>
          <SettingsPanel />
        </SheetContent>
      </Sheet>
    </div>
  );
}
