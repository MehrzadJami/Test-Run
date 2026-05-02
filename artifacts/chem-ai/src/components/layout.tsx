import { Link, useLocation } from "wouter";
import { ConnectionStatus } from "./connection-status";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "@workspace/replit-auth-web";
import { 
  LayoutDashboard, 
  Library, 
  ActivitySquare, 
  DownloadCloud, 
  PlusCircle, 
  Moon, 
  Sun,
  Menu,
  X,
  FlaskConical,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { Button } from "./ui/button";
import { useState } from "react";

export function Sidebar() {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/new", label: "New Extraction", icon: PlusCircle },
    { href: "/model-cards", label: "Model Cards", icon: Library },
    { href: "/simulation", label: "Simulation", icon: ActivitySquare },
    { href: "/experimental-data", label: "Exp. Data Fitting", icon: FlaskConical },
    { href: "/exports", label: "Exports", icon: DownloadCloud },
  ];

  const displayName =
    user?.firstName
      ? user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.firstName
      : user?.email ?? "Account";

  const initials =
    user?.firstName && user?.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user?.firstName
      ? user.firstName[0].toUpperCase()
      : user?.email
      ? user.email[0].toUpperCase()
      : "U";

  return (
    <>
      {/* Mobile Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-background flex items-center justify-between px-4 z-50">
        <Link href="/">
          <div className="bg-slate-900 rounded-xl px-3 py-2 dark:bg-transparent dark:px-0 dark:py-0">
            <img
              src="/logo.png"
              alt="ChemEngAI"
              className="h-7 w-auto object-contain"
            />
          </div>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-border flex flex-col transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:h-screen
      `}>
        <div className="h-16 flex items-center px-4 border-b border-border">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <div className="bg-slate-900 rounded-xl px-3 py-2 dark:bg-transparent dark:px-0 dark:py-0">
              <img
                src="/logo.png"
                alt="ChemEngAI"
                className="h-8 w-auto object-contain"
              />
            </div>
          </Link>
        </div>

        <div className="flex-1 py-6 px-4 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                  ${isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}
                `}
                data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                onClick={() => setIsOpen(false)}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-sidebar-primary-foreground" : "text-muted-foreground"}`} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border flex flex-col gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-sidebar-foreground" 
            onClick={toggleTheme}
            data-testid="btn-toggle-theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 mr-2" />
            ) : (
              <Moon className="w-4 h-4 mr-2" />
            )}
            <span className="text-sm">Toggle Theme</span>
          </Button>

          {/* Auth section */}
          {!isLoading && (
            isAuthenticated && user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
                  {initials}
                </div>
                <span className="flex-1 text-xs text-sidebar-foreground truncate" title={displayName}>
                  {displayName}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={logout}
                  title="Sign out"
                  data-testid="btn-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sidebar-foreground"
                onClick={login}
                data-testid="btn-login"
              >
                <LogIn className="w-4 h-4 mr-2" />
                <span className="text-sm">Sign In</span>
              </Button>
            )
          )}

          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading…</span>
            </div>
          )}
        </div>

        <ConnectionStatus />
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 md:pt-0 pt-16 h-screen overflow-y-auto">
        <div className="flex-1 p-6 md:p-8 lg:p-10 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
