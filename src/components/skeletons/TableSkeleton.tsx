import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  rows?: number;
  cols?: number;
  withHeader?: boolean;
}

export function TableSkeleton({ rows = 8, cols = 6, withHeader = true }: Props) {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        {withHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: cols }).map((_, i) => (
                <TableHead key={i}><Skeleton className="h-4 w-24" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rows }).map((_, r) => (
            <TableRow key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <TableCell key={c}>
                  <Skeleton className="h-4" style={{ width: `${50 + ((r + c) % 5) * 10}%` }} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default TableSkeleton;
