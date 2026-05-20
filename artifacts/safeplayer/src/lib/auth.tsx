import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey, setAuthTokenGetter } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@workspace/api-client-react";

const TOKEN_KEY = "safeplayer_token";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Restore token from localStorage on module load so the getter
// is ready before the first React Query fetch fires.
const storedToken = localStorage.getItem(TOKEN_KEY);
if (storedToken) {
  setAuthTokenGetter(() => storedToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe({ query: { retry: false } });

  // Keep the token getter in sync whenever the component mounts.
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) setAuthTokenGetter(() => t);
  }, []);

  function login(userData: User, token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthTokenGetter(() => token);
    queryClient.setQueryData(getGetMeQueryKey(), userData);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAuthTokenGetter(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
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
