import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Figures are right-aligned; identifiers are not. */
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  /**
   * What this column becomes below `md`, where the table turns into a
   * card list:
   * - `identity` — the row header, top-left of the card (exactly one)
   * - `primary`  — the headline figure, top-right of the card (exactly one)
   * - `meta`     — a labelled value in the card's grid
   * - `hidden`   — dropped on phones
   *
   * A card that reproduces every column is just a rotated table, so
   * demote freely: three or four `meta` columns is the working maximum.
   */
  mobile?: "identity" | "primary" | "meta" | "hidden";
  /** A short label for the card grid, when the header is too long. */
  mobileLabel?: ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  /** Read by screen readers; visually hidden. */
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered in place of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

const alignClass = (align: DataTableColumn<unknown>["align"]) =>
  align === "left" ? "text-left" : "text-right";

/**
 * The app's data surface, in two forms driven by one column definition.
 *
 * Every table in the app used to rely on overflow-x-auto as its entire
 * mobile strategy — a seven-column table dragged sideways on a phone.
 * Below `md` this renders a card list instead.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  const identity =
    columns.find((column) => column.mobile === "identity") ?? columns[0];
  const primary = columns.find((column) => column.mobile === "primary");
  const meta = columns.filter((column) => column.mobile === "meta");

  return (
    <div className={className}>
      {/* Desktop */}
      <table className="hidden w-full border-collapse md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-3 pb-2 font-mono text-meta font-normal uppercase text-text-muted first:pl-5 last:pr-5",
                  alignClass(column.align)
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border-faint last:border-b-0"
            >
              {columns.map((column) => {
                const content = column.cell(row);
                const shared = cn(
                  "px-3 py-2 first:pl-5 last:pr-5",
                  alignClass(column.align),
                  column.className
                );
                return column === identity ? (
                  <th
                    key={column.key}
                    scope="row"
                    className={cn(shared, "text-body font-semibold text-text-primary")}
                  >
                    {content}
                  </th>
                ) : (
                  <td
                    key={column.key}
                    className={cn(shared, "font-mono text-num-md tabular text-text-secondary")}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone */}
      <ul className="md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="border-b border-border-faint px-4 py-3 last:border-b-0"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-body font-semibold text-text-primary">
                {identity.cell(row)}
              </span>
              <span className="grow" />
              {primary ? (
                <span className="font-mono text-num-md tabular text-text-primary">
                  {primary.cell(row)}
                </span>
              ) : null}
            </div>
            {meta.length > 0 ? (
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {meta.map((column) => (
                  <span key={column.key}>
                    <span className="block font-mono text-meta uppercase text-text-muted">
                      {column.mobileLabel ?? column.header}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-num-sm tabular text-text-secondary",
                        column.className
                      )}
                    >
                      {column.cell(row)}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
