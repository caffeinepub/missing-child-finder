import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, Search, Shield, User, X } from "lucide-react";
import { useState } from "react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useIsCallerAdmin } from "../hooks/useQueries";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/register", label: "Register Child" },
  { href: "/search", label: "Search Cases" },
] as const;

export default function Navbar() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;
  const { identity, clear } = useInternetIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: isAdmin } = useIsCallerAdmin();

  const sessionMode = localStorage.getItem("sessionMode");
  const showAdminLink = isAdmin && sessionMode === "admin";

  const principalShort = identity
    ? `${identity.getPrincipal().toString().slice(0, 6)}...`
    : "Guest";

  const handleLogout = async () => {
    localStorage.removeItem("sessionMode");
    await clear();
    queryClient.clear();
  };

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <Link
            to="/dashboard"
            className="flex items-center gap-3 shrink-0"
            data-ocid="nav.link"
          >
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow">
              <Search className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-foreground leading-none">
                Missing Child
              </p>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                Finder System
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                data-ocid="nav.link"
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  pathname === link.href
                    ? "text-primary border-b-2 border-primary rounded-none"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {showAdminLink && (
              <Link
                to="/admin"
                data-ocid="nav.link"
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                  pathname === "/admin"
                    ? "text-primary border-b-2 border-primary rounded-none"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Panel
              </Link>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {identity ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-ocid="nav.dropdown_menu"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
                  >
                    <Avatar className="w-6 h-6">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        <User className="w-3 h-3" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium hidden sm:block">
                      {principalShort}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/account" })}
                    data-ocid="nav.link"
                  >
                    <User className="w-4 h-4 mr-2" />
                    My Account
                  </DropdownMenuItem>
                  {showAdminLink && (
                    <DropdownMenuItem
                      onClick={() => navigate({ to: "/admin" })}
                      data-ocid="nav.link"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleLogout} data-ocid="nav.link">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login">
                <Button size="sm" data-ocid="nav.link">
                  Login
                </Button>
              </Link>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md hover:bg-muted"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-border py-3 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                data-ocid="nav.link"
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-2 text-sm font-medium rounded-md ${
                  pathname === link.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {showAdminLink && (
              <Link
                to="/admin"
                data-ocid="nav.link"
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-1.5 ${
                  pathname === "/admin"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Panel
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
