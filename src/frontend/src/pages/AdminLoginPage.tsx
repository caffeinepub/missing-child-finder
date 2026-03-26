import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, loginStatus, identity } = useInternetIdentity();
  const {
    actor,
    isFetching: actorLoading,
    isError: actorError,
    refetch: refetchActor,
  } = useActor();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [success, setSuccess] = useState(false);

  const isLoggingIn = loginStatus === "logging-in";

  const handleIdentityLogin = async () => {
    setError("");
    try {
      await login();
    } catch (_err: unknown) {
      setError("Login failed. Please try again.");
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Admin password is required");
      return;
    }
    if (!actor) {
      setError("Backend not connected. Please click Retry.");
      return;
    }

    setClaiming(true);
    try {
      await actor.claimAdminRole(password);
      setSuccess(true);
      setTimeout(() => navigate({ to: "/admin" }), 800);
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message ?? err);
      if (
        msg.includes("Invalid password") ||
        msg.includes("invalid password") ||
        msg.includes("wrong password")
      ) {
        setError("Incorrect admin password. Please use the correct password.");
      } else if (
        msg.includes("IC0508") ||
        msg.includes("is stopped") ||
        msg.includes("temporarily unavailable")
      ) {
        setError(
          "Backend is temporarily restarting. Please wait 30 seconds and try again.",
        );
      } else {
        setError(msg || "Failed to claim admin role. Please try again.");
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary shadow-lg mb-4">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Admin Login</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Restricted access — authorized administrators only
          </p>
        </div>

        <div className="bg-card rounded-xl shadow-card border border-border p-8 space-y-6">
          {/* Backend connection error */}
          {actorError && !actorLoading && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Backend not connected. Click Retry to reconnect.</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchActor()}
                  className="ml-2 h-7 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Success message */}
          {success && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Admin access granted! Redirecting...
              </AlertDescription>
            </Alert>
          )}

          {/* General error */}
          {error && (
            <Alert variant="destructive" data-ocid="admin-login.error_state">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Internet Identity */}
          {!identity ? (
            <div className="space-y-4">
              <div className="p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">
                  Step 1: Authenticate with Internet Identity
                </p>
                <p>
                  Sign in with your Internet Identity to verify your identity
                  before entering the admin password.
                </p>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleIdentityLogin}
                disabled={isLoggingIn}
                data-ocid="admin-login.primary_button"
              >
                {isLoggingIn ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  "Login with Internet Identity"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted/40 rounded-lg text-sm">
                <p className="font-medium text-foreground mb-1">
                  Step 2: Enter Admin Password
                </p>
                <p className="text-muted-foreground">
                  Enter the admin passcode to claim admin access.
                </p>
              </div>

              {actorLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting to backend...
                </div>
              )}

              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password">Admin Password</Label>
                  <div className="relative">
                    <Input
                      id="admin-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter admin password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      data-ocid="admin-login.input"
                      autoComplete="current-password"
                      disabled={claiming || success}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={claiming || actorLoading || !actor || success}
                  data-ocid="admin-login.submit_button"
                >
                  {claiming ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </span>
                  ) : actorLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    "Access Admin Panel"
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => navigate({ to: "/" })}
          data-ocid="admin-login.link"
        >
          ← Back to Home
        </button>
      </motion.div>
    </div>
  );
}
