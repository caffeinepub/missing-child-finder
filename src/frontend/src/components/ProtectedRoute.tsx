import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { identity, isInitializing } = useInternetIdentity();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!identity) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
