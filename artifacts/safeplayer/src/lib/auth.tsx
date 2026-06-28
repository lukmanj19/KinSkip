import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";

const TOKEN_KEY = "safeplayer_token";
export const LAST_ADMIN_KEY = "safeplayer_last_admin";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Restore token from sessionStorage on module load so the getter
// is ready before the first React Query fetch fires.
// sessionStorage is cleared when the browser tab/window is closed,
// which enforces the "log out on close" requirement.
const storedToken = sessionStorage.getItem(TOKEN_KEY);
if (storedToken) {
  setAuthTokenGetter(() => storedToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { retry: false } });

  // Keep the token getter in sync whenever the component mounts.
  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setAuthTokenGetter(() => t);
  }, []);

  function login(userData: User, token: string) {
    sessionStorage.setItem(TOKEN_KEY, token);
    setAuthTokenGetter(() => token);
    queryClient.setQueryData(getGetMeQueryKey(), userData);
    // Persist last admin id in localStorage so guest mode can show safe content
    if (userData.role === "admin") {
      localStorage.setItem(LAST_ADMIN_KEY, String(userData.id));
    }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthTokenGetter(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    // lastAdminId stays in localStorage intentionally — guest mode needs it
  }

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
