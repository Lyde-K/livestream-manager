export function cachedJson(data: unknown, ttl = 30): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `private, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
    },
  });
}
