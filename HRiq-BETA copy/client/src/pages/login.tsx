import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import remoteLeverageLogo from "@assets/remote_leverage_logo_transparent.png";

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const redirect = params.get("redirect") || "/";
  const error = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setLocation(redirect);
    }
  }, [isAuthenticated, isLoading, redirect, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleGoogleLogin = () => {
    sessionStorage.setItem("auth_redirect", redirect);
    window.location.href = "/api/auth/google";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        window.location.href = redirect;
      } else {
        const data = await response.json();
        setFormError(data.error || "Invalid email or password");
      }
    } catch {
      setFormError("Unable to connect. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-lg shadow-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <img 
              src={remoteLeverageLogo} 
              alt="Remote Leverage" 
              className="h-16 w-16 rounded-lg object-cover mb-4"
            />
            <p className="text-sm text-muted-foreground">
              Sign in to continue
            </p>
          </div>

          {(error || formError) && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md text-center mb-6 border border-destructive/20">
              {error === "google-auth-failed"
                ? "Sign-in failed. Please use your @remoteleverage.com email."
                : formError || "An error occurred. Please try again."}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-10"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="h-10"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 bg-primary hover:bg-primary/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {/* Forgot password handler */}}
            >
              Forgot password
            </button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 gap-2"
            onClick={handleGoogleLogin}
          >
            <FcGoogle className="h-4 w-4" />
            Sign in with Google
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Secure access only
        </p>
      </div>
    </div>
  );
}
