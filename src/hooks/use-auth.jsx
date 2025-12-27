import { createContext, useContext, useEffect, useState } from "react";
import { storage } from "../lib/storage";
import { useQueryClient } from "@tanstack/react-query";
import { requestToken } from "../lib/firebase-messaging";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const queryClient = useQueryClient();

  // Restore session from localStorage on mount
  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const sessionStr = localStorage.getItem("society_user_session");
        let currentUser = null;
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            if (session && session.loggedIn) {
              currentUser = await storage.getCurrentUser();
            }
          } catch {
            currentUser = null;
          }
        }
        if (mounted) {
          setUser(currentUser);
          setRole(currentUser?.role ?? null);
          queryClient.setQueryData(["/api/user"], currentUser);
          // Request permission/token on session restore
          if (currentUser) {
            requestToken().catch(console.error);
          }
        }
      } catch (err) {
        if (mounted) setUser(null);
        if (mounted) setRole(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  // Login: persist session and update context state (no navigation here)
  const login = async (credentials, options = {}) => {
    setIsLoggingIn(true);
    try {
      const loggedInUser = await storage.login(credentials);

      setUser(loggedInUser);
      setRole(loggedInUser?.role ?? null);
      queryClient.setQueryData(["/api/user"], loggedInUser);
      
      // Request permission/token on login
      requestToken().catch(console.error);

      options.onSuccess?.(loggedInUser);
    } catch (error) {
      options.onError?.(error);
      throw error;
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout: clear session and context
  const logout = async () => {
    await storage.logout();
    setUser(null);
    setRole(null);
    queryClient.setQueryData(["/api/user"], null);
  };

  return (
    <AuthContext.Provider
      value={{ user, role, loading, isLoggingIn, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
