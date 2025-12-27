import { useAuth } from "@/hooks/use-auth.jsx";
import { Link } from "wouter";
import { LogOut, ShieldCheck, Home, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Layout({ children }) {
  const { user, logout } = useAuth();

  const getRoleIcon = () => {
    switch (user?.role) {
      case "admin": return <ShieldCheck className="h-5 w-5 text-primary" />;
      case "guard": return <User className="h-5 w-5 text-blue-600" />;
      default: return <Home className="h-5 w-5 text-green-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-xl tracking-tight hidden sm:block leading-none">
                SecureEntry
              </span>
              {user?.residencyName && (
                <span className="text-xs text-slate-500 font-medium hidden sm:block">
                  {user.residencyName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100">
              {getRoleIcon()}
              <span className="text-sm font-semibold text-emerald-700">
                {(user?.name || user?.username)} ({user?.role})
              </span>
            </div>

            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => logout()}
              className="text-slate-500 hover:text-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
