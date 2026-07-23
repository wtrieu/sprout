import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages } from "@/db/schema";
import { resolveImagePath } from "@/lib/stories/files";
import { normalizePageText } from "@/lib/stories/text";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textToHtml = (s: string): string => esc(normalizePageText(s)).replace(/\n/g, "<br/>");

/**
 * One self-contained HTML file: the whole book — text, base64-inlined
 * illustrations, Ken Burns motion, tap/swipe paging — readable with zero
 * network. Save it to Files/downloads and it works on a plane.
 */
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pages = db
    .select()
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .orderBy(asc(storyPages.pageIndex))
    .all();

  const title = story.title ?? "A Sprout Story";
  const pageData = pages.map((p) => {
    let src: string | null = null;
    if (p.imagePath) {
      const abs = resolveImagePath(p.imagePath);
      const mime = abs ? MIME[path.extname(abs).toLowerCase()] : undefined;
      if (abs && mime && fs.existsSync(abs)) {
        src = `data:${mime};base64,${fs.readFileSync(abs).toString("base64")}`;
      }
    }
    const m = p.motion;
    const style = m
      ? `--s0:${m.scaleFrom};--s1:${m.scaleTo};--x0:${m.xFrom}%;--x1:${m.xTo}%;--y0:${m.yFrom}%;--y1:${m.yTo}%;--dur:${m.durationS}s`
      : "";
    return { text: p.text, src, style, kb: !!m };
  });

  const pageSections = pageData
    .map(
      (p, i) => `<section class="page" data-i="${i}">
  ${
    p.src
      ? `<div class="frame">${
          p.kb
            ? `<img class="kb" style="${p.style}" src="${p.src}" alt=""/>`
            : `<img class="static" src="${p.src}" alt=""/>`
        }</div>`
      : ""
  }
  <p class="text">${textToHtml(p.text)}</p>
</section>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<title>${esc(title)}</title>
<style>
  html,body{margin:0;height:100%;background:#0d0a06;color:#fef3c7;font-family:Georgia,'Times New Roman',serif;-webkit-tap-highlight-color:transparent;overflow:hidden}
  #book{position:fixed;inset:0;display:flex;flex-direction:column}
  header{display:flex;justify-content:space-between;padding:16px;font-size:12px;color:rgba(254,243,199,.4);font-family:system-ui,sans-serif}
  .page,#title{flex:1;display:none;flex-direction:column;overflow:hidden}
  .page.active,#title.active{display:flex}
  #title{align-items:center;justify-content:center;text-align:center;padding:0 32px}
  #title h1{font-size:34px;line-height:1.3;font-weight:600;margin:0}
  #title p{margin-top:24px;font-size:13px;color:rgba(254,243,199,.4);font-family:system-ui,sans-serif}
  .frame{position:relative;flex:1;margin:0 16px;border-radius:16px;overflow:hidden}
  .frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .frame img.static{object-fit:contain}
  .page.active .kb{animation:kb var(--dur,24s) ease-in-out forwards;will-change:transform}
  @keyframes kb{from{transform:scale(var(--s0,1)) translate(var(--x0,0%),var(--y0,0%))}to{transform:scale(var(--s1,1)) translate(var(--x1,0%),var(--y1,0%))}}
  .page.active{animation:fadein .6s ease-out}
  @keyframes fadein{from{opacity:0}to{opacity:1}}
  .text{padding:24px 32px 48px;margin:0 auto;max-width:560px;text-align:center;font-size:22px;line-height:1.6}
  @media (prefers-reduced-motion: reduce){.page.active .kb{animation:none}.page.active{animation:none}}
</style></head>
<body>
<div id="book">
  <header><span>${esc(title)}</span><span id="counter"></span></header>
  <div id="title" class="active"><div><h1>${esc(title)}</h1><p>tap the right side to begin</p></div></div>
  ${pageSections}
</div>
<script>
(function(){
  var pages = document.querySelectorAll('.page');
  var titleEl = document.getElementById('title');
  var counter = document.getElementById('counter');
  var idx = -1, touchX = null;
  function show(i){
    idx = Math.max(-1, Math.min(i, pages.length - 1));
    titleEl.classList.toggle('active', idx === -1);
    pages.forEach(function(p, j){
      var on = j === idx;
      p.classList.toggle('active', on);
      if (on) { var img = p.querySelector('.kb'); if (img) { img.style.animation = 'none'; void img.offsetWidth; img.style.animation = ''; } }
    });
    counter.textContent = (idx + 1) + ' / ' + pages.length;
  }
  document.body.addEventListener('click', function(e){
    var x = e.clientX / window.innerWidth;
    if (x > 0.66) show(idx + 1); else if (x < 0.33) show(idx - 1);
  });
  document.body.addEventListener('touchstart', function(e){ touchX = e.touches[0].clientX; });
  document.body.addEventListener('touchend', function(e){
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (dx < -40) show(idx + 1); if (dx > 40) show(idx - 1);
    touchX = null;
  });
  window.addEventListener('keydown', function(e){
    if (e.key === 'ArrowRight' || e.key === ' ') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });
  show(-1);
})();
</script>
</body></html>`;

  const filename = `${(story.title ?? "story").replace(/[^\w ]/g, "").trim() || "story"}.html`;
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
};
