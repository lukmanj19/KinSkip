import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Shield, Home, Settings, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@workspace/api-client-react";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
        setLocation("/");
      },
    });
  };

  if (!user) return <>{children}</>;

  const navItems = user.role === "admin" 
    ? [
        { label: "Admin", href: "/admin", icon: LayoutDashboard },
        { label: "Library", href: "/dashboard", icon: Home },
        { label: "Settings", href: "/settings", icon: Settings },
      ]
    : [
        { label: "Library", href: "/dashboard", icon: Home },
      ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
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
  );
}
