import type { ReactNode } from "react";

type AuthProviderProps = {
  children: ReactNode;
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
};

export const AuthProvider = ({ children }: AuthProviderProps) => children;
