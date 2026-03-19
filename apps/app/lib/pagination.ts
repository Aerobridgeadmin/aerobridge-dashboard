/**
 * Pagination utilities for server actions.
 *
 * Usage in actions:
 *   const { skip, take } = parsePagination({ page: 1, pageSize: 25 });
 *   const [items, total] = await Promise.all([
 *     database.employee.findMany({ where, skip, take, orderBy }),
 *     database.employee.count({ where }),
 *   ]);
 *   return paginated(items, total, { page: 1, pageSize: 25 });
 */

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parsePagination(params: PaginationParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function paginated<T>(
  items: T[],
  total: number,
  params: { page: number; pageSize: number },
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.pageSize);
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasMore: params.page < totalPages,
  };
}
