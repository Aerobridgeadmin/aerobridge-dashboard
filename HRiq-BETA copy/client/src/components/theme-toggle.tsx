import { Moon, Sun, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, setTheme, girlyMode, setGirlyMode } = useTheme();

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setGirlyMode(!girlyMode)}
            className={girlyMode ? "text-pink-500 hover:text-pink-600 bg-pink-50 dark:bg-pink-950/30" : ""}
          >
            <Heart className={`h-4 w-4 transition-all ${girlyMode ? "fill-pink-500" : ""}`} />
            <span className="sr-only">Toggle girly mode</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{girlyMode ? "Disable" : "Enable"} girly mode</p>
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        data-testid="button-theme-toggle"
      >
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </div>
  );
}
