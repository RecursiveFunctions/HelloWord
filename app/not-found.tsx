import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3">
      <h1 className="font-heading text-2xl">Not found</h1>
      <Link href="/notebooks" className="text-sm underline">
        Back to notebooks
      </Link>
    </div>
  );
}
