import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, ShieldCheck, User } from "lucide-react";
import { UserRole } from "../backend";
import Navbar from "../components/Navbar";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import { useGetCallerProfile, useGetCallerRole } from "../hooks/useQueries";

function roleBadge(role: UserRole | undefined) {
  if (role === UserRole.admin)
    return (
      <Badge className="bg-primary/10 text-primary border-primary/20">
        Admin
      </Badge>
    );
  if (role === UserRole.user)
    return (
      <Badge className="bg-secondary/10 text-secondary border-secondary/20">
        User
      </Badge>
    );
  return <Badge variant="outline">Guest</Badge>;
}

export default function AccountPage() {
  const { identity } = useInternetIdentity();
  const { data: profile, isLoading: profileLoading } = useGetCallerProfile();
  const { data: role, isLoading: roleLoading } = useGetCallerRole();

  const principalId = identity?.getPrincipal().toString() ?? "—";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-foreground">My Account</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your account details and storage information
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card rounded-xl border border-border shadow-card p-6 space-y-5">
          {/* Username */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                Username
              </span>
            </div>
            {profileLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : (
              <span
                className="text-sm font-semibold text-foreground"
                data-ocid="account.panel"
              >
                {profile?.name ?? "—"}
              </span>
            )}
          </div>

          {/* Principal ID */}
          <div className="flex items-start justify-between py-3 border-b border-border gap-4">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-secondary" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                Principal ID
              </span>
            </div>
            <span className="text-xs font-mono text-foreground break-all text-right">
              {principalId}
            </span>
          </div>

          {/* Role */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-success" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                Role
              </span>
            </div>
            {roleLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <span data-ocid="account.card">{roleBadge(role)}</span>
            )}
          </div>

          {/* Storage */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                Storage
              </span>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5">
              <Database className="w-3 h-3" />
              512 GB Storage Allocated
            </Badge>
          </div>
        </div>
      </main>

      <footer className="bg-footer text-footer-foreground mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-center">
            &copy; {new Date().getFullYear()} Missing Child Finder. Built with
            love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
