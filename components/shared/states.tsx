export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="card flex min-h-40 items-center justify-center p-6 text-slate-500">
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="card flex min-h-48 flex-col items-center justify-center p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-red-200 bg-red-50 p-5 text-sm text-red-700">
      {message}
    </div>
  );
}
