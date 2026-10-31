import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { atlasMaps, atlasNodes, atlasRungLevels } from "@/db/schema";
import { getAuthenticatedEmail } from "@/lib/auth";
import { frontierCandidates } from "@/lib/atlas/picker";
import { playerForEmail } from "@/lib/atlas/players";
import { nodeProgressFor } from "@/lib/atlas/progress";
import { parseQuizJson, publicQuiz } from "@/lib/atlas/quiz";
import { rungsFor, verifiedReadingsFor } from "@/lib/atlas/rungs";
import { reapStaleRungs } from "@/lib/atlas/runner";

const byPosition = <T extends { position: number; id: number }>(a: T, b: T) =>
  a.position - b.position || a.id - b.id;

/** Everything the node page needs in one round trip. */
export const GET = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, Number(id))).get();
  if (!node) return NextResponse.json({ error: "not found" }, { status: 404 });
  reapStaleRungs(db);

  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, node.mapId)).get() ?? null;
  const mapNodes = db.select().from(atlasNodes).where(eq(atlasNodes.mapId, node.mapId)).all();
  const parent = node.parentId === null ? null : (mapNodes.find((n) => n.id === node.parentId) ?? null);
  const siblings =
    node.parentId === null
      ? []
      : mapNodes.filter((n) => n.parentId === node.parentId && n.id !== node.id).sort(byPosition);
  const children = mapNodes.filter((n) => n.parentId === node.id).sort(byPosition);

  // The stored quiz carries the answers, so it never leaves the server: the
  // row is stripped and the questions ship separately, choices only.
  const rungRows = rungsFor(db, node.id);
  const rungs = Object.fromEntries(
    atlasRungLevels.map((level) => {
      const row = rungRows.find((r) => r.level === level);
      if (!row) return [level, null];
      const { quizJson, ...safe } = row;
      return [level, { ...safe, hasQuiz: !!parseQuizJson(quizJson) }];
    }),
  );
  const onepager = rungRows.find((r) => r.level === "onepager");
  const quizQuestions =
    onepager?.status === "ready" ? parseQuizJson(onepager.quizJson) : null;
  const readings = verifiedReadingsFor(db, node.id);

  const titles = new Map(mapNodes.map((n) => [n.id, n.title]));
  const adjacent = frontierCandidates(mapNodes, node.id)
    .slice(0, 3)
    .map((c) => ({ nodeId: c.nodeId, title: titles.get(c.nodeId) ?? "", reason: c.reason }));

  const player = playerForEmail(db, getAuthenticatedEmail(req));
  const progress = player ? nodeProgressFor(db, player.id, node.id) : null;

  return NextResponse.json({
    node,
    map,
    parent,
    siblings,
    children,
    rungs,
    readings,
    adjacent,
    player: player ? { id: player.id, name: player.name, persona: player.persona } : null,
    progress,
    quiz: quizQuestions ? { questions: publicQuiz(quizQuestions) } : null,
  });
};
