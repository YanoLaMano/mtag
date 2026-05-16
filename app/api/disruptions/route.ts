import { NextResponse } from "next/server";

export const revalidate = 300;
export const dynamic = "force-dynamic";

/**
 * Scrape reso-m.fr Info-Trafic page to extract the list of currently
 * perturbed lines (badges shown on the "today" tab).
 */
export async function GET() {
  try {
    const res = await fetch(
      "https://www.reso-m.fr/TPL_CODE/TPL_INFOTRAFICLISTE/55-infotrafic.htm?PBN=today",
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; M-realtime)" },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { count: 0, lines: [], updatedAt: Date.now(), source: "reso-m.fr" },
        { status: 200 }
      );
    }
    const html = await res.text();

    // Extract the "today" block first
    const todayMatch = html.match(/<div[^>]*id="today"[^>]*>([\s\S]+?)(?:<div[^>]*id="tomorrow"|<\/section>)/);
    const block = todayMatch ? todayMatch[1] : html;

    // Each affected line appears as <li class="lignes ligneXXX">...
    const lineMatches = block.matchAll(/class="lignes\s+ligne([A-Z0-9]+)"/g);
    const set = new Set<string>();
    for (const m of lineMatches) set.add(m[1]);

    const lines = Array.from(set).sort((a, b) => {
      const an = parseInt(a, 10), bn = parseInt(b, 10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return a.localeCompare(b);
    });

    return NextResponse.json(
      {
        count: lines.length,
        lines,
        updatedAt: Date.now(),
        source: "https://www.reso-m.fr/55-infotrafic.htm",
      },
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { count: 0, lines: [], updatedAt: Date.now(), error: true },
      { status: 200 }
    );
  }
}
