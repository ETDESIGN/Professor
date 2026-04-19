import { supabase } from './supabaseClient';

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PaginationOptions {
  pageSize?: number;
  cursor?: string | null;
}

const DEFAULT_PAGE_SIZE = 25;

export function createPaginatedQuery<T>(
  table: string,
  selectFields: string,
  options: {
    filter?: (query: any) => any;
    orderBy?: string;
    orderAscending?: boolean;
    cursorColumn?: string;
  } = {}
) {
  const {
    filter,
    orderBy = 'created_at',
    orderAscending = false,
    cursorColumn = 'created_at',
  } = options;

  return async (pagination: PaginationOptions = {}): Promise<PaginatedResult<T>> => {
    const pageSize = pagination.pageSize || DEFAULT_PAGE_SIZE;
    let query = supabase
      .from(table)
      .select(selectFields)
      .order(orderBy, { ascending: orderAscending })
      .limit(pageSize + 1);

    if (filter) {
      query = filter(query);
    }

    if (pagination.cursor) {
      if (cursorColumn === 'created_at') {
        query = orderAscending
          ? query.gt(cursorColumn, pagination.cursor)
          : query.lt(cursorColumn, pagination.cursor);
      } else {
        const cursorValue = pagination.cursor;
        query = orderAscending
          ? query.gt(cursorColumn, cursorValue)
          : query.lt(cursorColumn, cursorValue);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    const items = (data || []) as T[];
    const hasMore = items.length > pageSize;
    const results = hasMore ? items.slice(0, pageSize) : items;

    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastItem = results[results.length - 1] as any;
      nextCursor = lastItem[cursorColumn] || lastItem.id || null;
    }

    return { data: results, nextCursor, hasMore };
  };
}

export const paginateMessages = createPaginatedQuery<any>(
  'messages',
  `*, sender:profiles!messages_sender_id_fkey(full_name, avatar_url), receiver:profiles!messages_receiver_id_fkey(full_name, avatar_url)`,
  {
    orderBy: 'created_at',
    orderAscending: false,
    cursorColumn: 'created_at',
  }
);

export const paginateAssignments = createPaginatedQuery<any>(
  'assignments',
  '*',
  {
    orderBy: 'created_at',
    orderAscending: false,
  }
);
