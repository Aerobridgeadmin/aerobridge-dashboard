"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createContextualCan } from "@casl/react";
import {
  defineAbilitiesFor,
  type AppAbility,
  type AppRole,
} from "./abilities";

const AbilityContext = createContext<AppAbility>(defineAbilitiesFor("member"));

export const Can = createContextualCan(AbilityContext.Consumer);

export function useAbility(): AppAbility {
  return useContext(AbilityContext);
}

type AbilityProviderProps = {
  role: AppRole;
  children: ReactNode;
};

export function AbilityProvider({ role, children }: AbilityProviderProps) {
  const ability = useMemo(() => defineAbilitiesFor(role), [role]);

  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  );
}
