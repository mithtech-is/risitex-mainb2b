import {
  Button,
  Container,
  Heading,
  Table,
  Text,
} from "@medusajs/ui";
import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  render: (row: T) => ReactNode;
  mono?: boolean;
  width?: string;
};

type ListShellProps<T> = {
  title: string;
  description?: string;
  rightAction?: ReactNode;
  filters?: ReactNode;
  loading: boolean;
  rows: T[];
  rowKey: (r: T) => string;
  columns: Column<T>[];
  totalCount: number;
  pageSize: number;
  offset: number;
  onOffsetChange: (o: number) => void;
  onRowClick?: (r: T) => void;
  onReload?: () => void;
  emptyMessage?: string;
};

export function ListShell<T>(props: ListShellProps<T>) {
  const {
    title,
    description,
    rightAction,
    filters,
    loading,
    rows,
    rowKey,
    columns,
    totalCount,
    pageSize,
    offset,
    onOffsetChange,
    onRowClick,
    onReload,
    emptyMessage = "No records.",
  } = props;

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;
  const colCount = columns.length;

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading>{title}</Heading>
          {description && (
            <Text className="text-ui-fg-subtle" size="small">
              {description}
            </Text>
          )}
        </div>
        {rightAction}
      </div>

      {(filters || onReload) && (
        <div className="flex flex-wrap items-end gap-3 px-6 py-4">
          {filters}
          {onReload && (
            <Button variant="secondary" onClick={onReload} disabled={loading}>
              Reload
            </Button>
          )}
        </div>
      )}

      <div className="px-6 py-4">
        <Table>
          <Table.Header>
            <Table.Row>
              {columns.map((c) => (
                <Table.HeaderCell
                  key={c.header}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {loading && (
              <Table.Row>
                <Table.Cell
                  {...({ colSpan: colCount } as Record<string, unknown>)}
                >
                  <Text>Loading…</Text>
                </Table.Cell>
              </Table.Row>
            )}
            {!loading && rows.length === 0 && (
              <Table.Row>
                <Table.Cell
                  {...({ colSpan: colCount } as Record<string, unknown>)}
                >
                  <Text className="text-ui-fg-subtle">{emptyMessage}</Text>
                </Table.Cell>
              </Table.Row>
            )}
            {!loading &&
              rows.map((row) => (
                <Table.Row
                  key={rowKey(row)}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <Table.Cell key={c.header}>
                      {c.mono ? (
                        <span className="font-mono text-xs">
                          {c.render(row)}
                        </span>
                      ) : (
                        c.render(row)
                      )}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
          </Table.Body>
        </Table>

        {totalCount > pageSize && (
          <div className="mt-4 flex items-center justify-between">
            <Text size="small" className="text-ui-fg-subtle">
              Page {currentPage} of {pageCount} · {totalCount} total
            </Text>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={offset === 0}
                onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={offset + pageSize >= totalCount}
                onClick={() => onOffsetChange(offset + pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
