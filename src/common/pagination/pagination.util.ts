// Offset-based pagination: query params -> a safe {limit, offset}, plus a helper to
// shape the response envelope consistently across every list endpoint.

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function toOffsetLimit(query: PageQuery): {
  offset: number;
  limit: number;
  page: number;
} {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { offset: (page - 1) * pageSize, limit: pageSize, page };
}

export function toPageResult<T>(
  rows: T[],
  total: number,
  query: PageQuery,
): PageResult<T> {
  const { page, limit } = toOffsetLimit(query);
  return { data: rows, page, pageSize: limit, total };
}
