/**
 * Starter feeds for `POST /api/feeds/refresh`. Used verbatim by the memory
 * store and inserted by migration `100_feeds.sql` so both backends agree.
 */
export const DEFAULT_FEEDS: {
  title: string;
  feed_url: string;
  site_url: string | null;
}[] = [
  {
    title: "Simon Willison",
    feed_url: "https://simonwillison.net/atom/everything/",
    site_url: "https://simonwillison.net",
  },
  {
    title: "Julia Evans",
    feed_url: "https://jvns.ca/atom.xml",
    site_url: "https://jvns.ca",
  },
  {
    title: "Dan Luu",
    feed_url: "https://danluu.com/atom.xml",
    site_url: "https://danluu.com",
  },
];
