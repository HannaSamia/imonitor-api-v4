export class PaginationDto<T> {
  limit: number;
  page: number;
  nextPage: number | null;
  prevPage: number | null;
  nextUrl: string | null;
  prevUrl: string | null;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  data: T;
}
