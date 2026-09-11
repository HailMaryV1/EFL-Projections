// Real, recurring bug class in this product family: PostgREST caps any
// unbounded .select() at 1000 rows by default. This project has ~3570
// real players (vs. dreamteam-projections' ~544), so queries that would
// have been safely under the cap there are NOT safe here - confirmed
// live: the Projected Points page silently showed "1000 of 1000 players"
// instead of the real ~3570. Every query across the full player (or
// season-stats) pool must range-paginate through every page, not trust
// one response - same fix already applied throughout scripts/*.py.
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
