import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Eye, EyeOff, Search, Shield } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useActor } from "../hooks/useActor";
import { useInternetIdentity } from "../hooks/useInternetIdentity";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginStatus, identity } = useInternetIdentity();
  const { actor } = useActor();

  const [signInForm, setSignInForm] = useState({ username: "", password: "" });
  const [signUpForm, setSignUpForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("signin");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  // Only auto-redirect if NOT on the admin tab
  if (identity && activeTab !== "admin") {
    navigate({ to: "/dashboard" });
    return null;
  }

  const isLoggingIn = loginStatus === "logging-in";

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!signInForm.username.trim()) {
      setError("Username is required");
      return;
    }
    if (!signInForm.password.trim()) {
      setError("Password is required");
      return;
    }
    try {
      await login();
      localStorage.setItem("sessionMode", "user");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      setError(err?.message || "Login failed. Please try again.");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!signUpForm.username.trim()) {
      setError("Username is required");
      return;
    }
    if (!signUpForm.email.trim()) {
      setError("Email is required");
      return;
    }
    if (!signUpForm.password.trim() || signUpForm.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (signUpForm.password !== signUpForm.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    try {
      await login();
      if (actor) {
        await actor.saveCallerUserProfile({ name: signUpForm.username });
      }
      localStorage.setItem("sessionMode", "user");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      setError(err?.message || "Sign up failed. Please try again.");
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");
    if (!adminPassword.trim()) {
      setAdminError("Admin password is required");
      return;
    }
    if (!actor) {
      setAdminError("Not connected. Please wait and try again.");
      return;
    }
    setAdminLoading(true);
    try {
      await actor.claimAdminRole(adminPassword);
      localStorage.setItem("sessionMode", "admin");
      navigate({ to: "/admin" });
    } catch (_err: unknown) {
      setAdminError("Invalid admin password. Please try again.");
    } finally {
      setAdminLoading(false);
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
        {/* Logo + Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary shadow-lg mb-4">
            <Search className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Missing Child Finder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Secure portal for authorized personnel
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl shadow-card border border-border p-8">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v);
              setError("");
              setAdminError("");
            }}
          >
            <TabsList
              className="grid grid-cols-3 w-full mb-6"
              data-ocid="login.tab"
            >
              <TabsTrigger value="signin" data-ocid="login.tab">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" data-ocid="login.tab">
                Sign Up
              </TabsTrigger>
              <TabsTrigger value="admin" data-ocid="login.tab">
                <Shield className="w-3.5 h-3.5 mr-1" />
                Admin
              </TabsTrigger>
            </TabsList>

            {error && activeTab !== "admin" && (
              <Alert
                variant="destructive"
                className="mb-4"
                data-ocid="login.error_state"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-username">Username</Label>
                  <Input
                    id="signin-username"
                    data-ocid="login.input"
                    placeholder="Enter your username"
                    value={signInForm.username}
                    onChange={(e) =>
                      setSignInForm((p) => ({ ...p, username: e.target.value }))
                    }
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      data-ocid="login.input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={signInForm.password}
                      onChange={(e) =>
                        setSignInForm((p) => ({
                          ...p,
                          password: e.target.value,
                        }))
                      }
                      autoComplete="current-password"
                      className="pr-10"
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
                  disabled={isLoggingIn}
                  data-ocid="login.submit_button"
                >
                  {isLoggingIn ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-username">Username</Label>
                  <Input
                    id="signup-username"
                    data-ocid="register.input"
                    placeholder="Choose a username"
                    value={signUpForm.username}
                    onChange={(e) =>
                      setSignUpForm((p) => ({ ...p, username: e.target.value }))
                    }
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">Email Address</Label>
                  <Input
                    id="signup-email"
                    data-ocid="register.input"
                    type="email"
                    placeholder="Enter your email"
                    value={signUpForm.email}
                    onChange={(e) =>
                      setSignUpForm((p) => ({ ...p, email: e.target.value }))
                    }
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      data-ocid="register.input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a password"
                      value={signUpForm.password}
                      onChange={(e) =>
                        setSignUpForm((p) => ({
                          ...p,
                          password: e.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      className="pr-10"
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
                <div className="space-y-1.5">
                  <Label htmlFor="signup-confirm">Confirm Password</Label>
                  <Input
                    id="signup-confirm"
                    data-ocid="register.input"
                    type="password"
                    placeholder="Confirm your password"
                    value={signUpForm.confirmPassword}
                    onChange={(e) =>
                      setSignUpForm((p) => ({
                        ...p,
                        confirmPassword: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  disabled={isLoggingIn}
                  data-ocid="register.submit_button"
                >
                  {isLoggingIn ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account...
                    </span>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="admin">
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                  <Shield className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Admin Access
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Requires Internet Identity authentication first.
                    </p>
                  </div>
                </div>

                {adminError && (
                  <Alert variant="destructive" data-ocid="login.error_state">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{adminError}</AlertDescription>
                  </Alert>
                )}

                {!identity ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Step 1: Authenticate with Internet Identity
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setAdminError("");
                        login();
                      }}
                      disabled={isLoggingIn}
                      data-ocid="login.primary_button"
                    >
                      {isLoggingIn ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Connecting...
                        </span>
                      ) : (
                        "Sign in with Internet Identity"
                      )}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Step 2: Enter your admin password
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-password">Admin Password</Label>
                      <Input
                        id="admin-password"
                        data-ocid="login.input"
                        type="password"
                        placeholder="Enter admin password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={adminLoading}
                      data-ocid="login.submit_button"
                    >
                      {adminLoading ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying...
                        </span>
                      ) : (
                        "Access Admin Panel"
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Authorized personnel only. Unauthorized access is prohibited.
        </p>
      </motion.div>
    </div>
  );
}
