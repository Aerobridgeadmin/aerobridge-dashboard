import remoteLeverageLogo from "@assets/remote_leverage_logo_transparent.png";

interface LoadingSpinnerProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ 
  message = "Loading...", 
  size = "md",
  className = ""
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16"
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <img 
        src={remoteLeverageLogo} 
        alt="Loading" 
        className={`${sizeClasses[size]} animate-spin`}
        style={{ animationDuration: "1.5s" }}
      />
      {message && (
        <p className="text-muted-foreground font-medium">{message}</p>
      )}
    </div>
  );
}
