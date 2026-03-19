"use client";

import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { HeartIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

const themes = [
  { label: "Light", value: "light", icon: "sun" },
  { label: "Dark", value: "dark", icon: "moon" },
  { label: "Girly ", value: "girly", icon: "heart" },
  { label: "System", value: "system", icon: "sun" },
] as const;

export const ModeToggle = () => {
  const { setTheme, theme } = useTheme();
  const isGirly = theme === "girly";
  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="shrink-0 text-foreground"
          size="icon"
          variant="ghost"
        >
          {isGirly ? (
            <HeartIcon className="h-[1.2rem] w-[1.2rem] text-pink-500 fill-pink-500" />
          ) : isDark ? (
            <MoonIcon className="h-[1.2rem] w-[1.2rem]" />
          ) : (
            <SunIcon className="h-[1.2rem] w-[1.2rem]" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map(({ label, value, icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={theme === value ? "bg-accent font-medium" : ""}
          >
            {icon === "heart" ? (
              <HeartIcon className="mr-2 h-4 w-4 text-pink-500 fill-pink-500" />
            ) : icon === "moon" ? (
              <MoonIcon className="mr-2 h-4 w-4" />
            ) : (
              <SunIcon className="mr-2 h-4 w-4" />
            )}
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
