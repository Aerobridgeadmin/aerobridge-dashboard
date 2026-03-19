import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import Image from "next/image";
import type { ReactNode } from "react";

type AuthLayoutProps = {
  readonly children?: ReactNode;
};

const AuthLayout = ({ children }: AuthLayoutProps) => (
  <div className="container relative grid h-dvh flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
    <div className="relative hidden h-full flex-col p-10 text-white lg:flex overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-yellow-400/20 via-transparent to-blue-600/30" />
      <div className="relative z-20 flex items-center font-semibold text-lg text-white">
        <Image src="/logo.png" alt="Remote Leverage" width={32} height={32} className="mr-2 rounded-sm" />
        Remote Leverage
      </div>
      <div className="absolute top-4 right-4 z-20">
        <ModeToggle />
      </div>
      <div className="relative z-20 mt-auto">
        <blockquote className="space-y-2">
          <p className="text-lg text-white/90">
            &ldquo;Remote Leverage transformed how we manage our global
            workforce. Onboarding, payments, and compliance — all in one
            place.&rdquo;
          </p>
          <footer className="text-sm text-white/70">
            — HR Director, Enterprise Client
          </footer>
        </blockquote>
      </div>
    </div>
    <div className="lg:p-8">
      <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center space-y-6">
        <div className="flex flex-col items-center space-y-2 lg:hidden">
          <Image src="/logo.png" alt="Remote Leverage" width={48} height={48} className="rounded-md" />
          <span className="text-lg font-semibold">Remote Leverage</span>
        </div>
        {children}
      </div>
    </div>
  </div>
);

export default AuthLayout;
