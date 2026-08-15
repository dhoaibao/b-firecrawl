import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiUrl } from "@/lib/api";

export interface AdminIdentity {
  email: string;
}

interface AuthContextType {
  admin: AdminIdentity | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAdmin = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/admin/api/auth/me"), { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setAdmin(json.data);
      } else {
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAdmin();
  }, [fetchAdmin]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(apiUrl("/admin/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(json.error || "Login failed");
    }

    const json = await res.json();
    setAdmin(json.data);
  }, []);

  const logout = useCallback(async () => {
    await fetch(apiUrl("/admin/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
    setAdmin(null);
  }, []);

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
