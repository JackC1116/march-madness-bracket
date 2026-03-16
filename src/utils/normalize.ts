/**
 * Normalize a value to the 0-1 range using min-max scaling.
 * Values outside [min, max] are clamped.
 */
export function normalizeMinMax(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const clamped = Math.max(min, Math.min(max, value));
  return (clamped - min) / (max - min);
}

/**
 * Convert a rank (1 = best) to a 0-1 score where 1.0 = best.
 * Rank 1 out of 64 teams => 1.0; rank 64 => ~0.0.
 */
export function normalizeRankInverse(rank: number, totalTeams: number): number {
  if (totalTeams <= 1) return 1;
  return (totalTeams - rank) / (totalTeams - 1);
}

/**
 * Standard logistic (sigmoid) function for probability conversion.
 * Maps (-inf, +inf) to (0, 1). logistic(0) = 0.5.
 */
export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Compress bracket state for URL sharing.
 * Returns a base64-encoded string.
 */
export function compress(data: unknown): string {
  const json = JSON.stringify(data);
  // Use btoa with URI-safe encoding for binary-safe transport
  return btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}

/**
 * Decompress a base64-encoded bracket state string.
 * Returns the parsed object.
 */
export function decompress<T = unknown>(str: string): T {
  const binary = atob(str);
  const decoded = decodeURIComponent(
    Array.from(binary)
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
  return JSON.parse(decoded) as T;
}
