import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import remoteLeverageLogo from "@assets/remote_leverage_logo_transparent.png";
import { Button } from "@/components/ui/button";
import { UserAvatarMenu } from "@/components/user-avatar-menu";

interface AppHeaderProps {
  showBackButton?: boolean;
  backTo?: string;
  currentTool?: "recruitiq" | null;
  showNavigation?: boolean;
  onSettingsClick?: () => void;
}

export function AppHeader({ showBackButton = false, backTo, currentTool = null, showNavigation = false, onSettingsClick }: AppHeaderProps) {
  const [location, navigate] = useLocation();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      window.history.back();
    }
  };

  return (
    <header className="h-14 border-b bg-card sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-full">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 mr-1 flex items-center justify-center">
              {showBackButton && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Link href="/dashboard-home">
              <img 
                src={remoteLeverageLogo} 
                alt="Remote Leverage" 
                className="h-8 w-8 rounded-md object-cover cursor-pointer hover:opacity-80 transition-opacity"
              />
            </Link>
            {currentTool === "recruitiq" && (
              <span className="text-sm font-medium text-primary">RecruitIQ™</span>
            )}
          </div>

          {showNavigation && (
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/resumes" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Candidates
              </Link>
              <Link href="/jobs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Jobs
              </Link>
              <Link href="/recruitiq-interviews" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Interviews
              </Link>
            </nav>
          )}

          <div className="flex items-center">
            <UserAvatarMenu onSettingsClick={onSettingsClick} />
          </div>
        </div>
      </div>
    </header>
  );
}
