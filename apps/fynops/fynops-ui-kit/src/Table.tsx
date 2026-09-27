import React from "react";

export type TableAlign = "left" | "right" | "center";

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Defaults to `String(row[key])`. */
  render?: (row: T) => React.ReactNode;
  align?: TableAlign;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  /** Shown in place of the body when `rows` is empty. Defaults to "No data". */
  emptyMessage?: React.ReactNode;
  className?: string;
}

const alignClass = (align?: TableAlign): string | undefined =>
  align && align !== "left" ? `fo-ui-table-cell--${align}` : undefined;

/** A plain table shell: header, rows and an empty state. No sorting or paging. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data",
  className,
}: TableProps<T>): React.ReactElement {
  const classes = ["fo-ui-table", className].filter(Boolean).join(" ");
  return (
    <table className={classes}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} className={alignClass(col.align)}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="fo-ui-table-empty" colSpan={columns.length}>
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((col) => (
                <td key={col.key} className={alignClass(col.align)}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
