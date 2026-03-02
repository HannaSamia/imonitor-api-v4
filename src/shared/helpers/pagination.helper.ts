import { PaginationDto } from '../dto/pagination.dto';

export function getPagination(
  page: number,
  size: number,
  defaultLimit = 10,
): { limit: number; offset: number } {
  const limit = size > 0 ? size : defaultLimit;
  const offset = page > 0 ? page * limit : 0;
  return { limit, offset };
}

export function buildPaginationResponse<T>(
  paginationObject: PaginationDto<T>,
  search: string,
  fullUrl: string,
): PaginationDto<T> {
  const { page, limit, totalPages } = paginationObject;
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';

  paginationObject.hasNext = page < totalPages - 1;
  paginationObject.hasPrev = page > 0;
  paginationObject.nextPage = paginationObject.hasNext ? page + 1 : null;
  paginationObject.prevPage = paginationObject.hasPrev ? page - 1 : null;
  paginationObject.nextUrl = paginationObject.hasNext
    ? `${fullUrl}?page=${page + 1}&size=${limit}${searchParam}`
    : null;
  paginationObject.prevUrl = paginationObject.hasPrev
    ? `${fullUrl}?page=${page - 1}&size=${limit}${searchParam}`
    : null;

  return paginationObject;
}
