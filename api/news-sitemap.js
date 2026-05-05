// Google News Sitemap — only articles published in the last 2 days
// Google News indexes articles within 48 hours of publication.
// Submit this URL in Google Search Console → Sitemaps.
export default async function handler(req, res) {
  try {
    let allPosts = [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      let page = 1;
      let totalPages = 1;
      do {
        const response = await fetch(
          `https://apnablogserver.onrender.com/api/post?page=${page}&limit=100`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const data = await response.json();
        allPosts = allPosts.concat(Array.isArray(data.data) ? data.data : []);
        totalPages = data.totalPages || 1;
        page++;
      } while (page <= totalPages);
    } catch (e) {
      console.warn('News sitemap: backend unavailable:', e.message);
    } finally {
      clearTimeout(timeout);
    }

    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;

    const recentPosts = allPosts.filter(p =>
      p.status === 'published' &&
      p.title &&
      new Date(p.createdAt).getTime() >= twoDaysAgo
    );

    const escape = str =>
      String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const urls = recentPosts.map(post => {
      const url  = `https://apnainsights.com/blog/${post.slug || post._id}`;
      const date = new Date(post.createdAt).toISOString();

      return `
  <url>
    <loc>${url}</loc>
    <news:news>
      <news:publication>
        <news:name>ApnaInsights</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${date}</news:publication_date>
      <news:title>${escape(post.title)}</news:title>
    </news:news>
  </url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  ${urls || '<!-- No articles published in the last 48 hours -->'}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
    res.status(200).send(xml);

  } catch (err) {
    console.error('News sitemap error:', err);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
</urlset>`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(fallback);
  }
}
