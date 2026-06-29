"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8 space-y-4">
      <h2 className="text-lg font-bold text-red-400">Dashboard error</h2>
      <pre className="text-xs bg-gray-900 text-red-300 p-4 rounded overflow-auto max-h-64">
        {error.message}
        {"\n"}
        {error.stack}
      </pre>
      <p className="text-xs text-gray-400">Digest: {error.digest}</p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm rounded bg-blue-600 text-white"
      >
        Try again
      </button>
    </div>
  );
}
