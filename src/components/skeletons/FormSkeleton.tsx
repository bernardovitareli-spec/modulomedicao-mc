import { Skeleton } from "@/components/ui/skeleton";

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
export default FormSkeleton;
