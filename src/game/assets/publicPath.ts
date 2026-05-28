/**
 * Prepend Vite's BASE_URL to a public-assets path.
 *
 * In dev, BASE_URL is "/", so passing "assets/foo.png" yields "/assets/foo.png".
 * In a GitHub Pages build, BASE_URL is "/LeagueOfFun/", so the same input
 * yields "/LeagueOfFun/assets/foo.png".
 *
 * Pass paths WITHOUT a leading slash. Leading slashes are tolerated (stripped).
 */
export function publicAsset(path: string): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return import.meta.env.BASE_URL + clean;
}
