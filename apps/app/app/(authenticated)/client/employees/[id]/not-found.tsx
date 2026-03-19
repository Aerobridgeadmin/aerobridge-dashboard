import Link from "next/link";

export default function EmployeeNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="text-6xl font-bold text-muted-foreground/30">404</div>
      <h1 className="text-xl font-semibold">Contractor Not Found</h1>
      <p className="text-sm text-muted-foreground">
        This contractor doesn&apos;t exist or you don&apos;t have access to view them.
      </p>
      <Link
        href="/client/employees"
        className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to Contractors
      </Link>
    </div>
  );
}
