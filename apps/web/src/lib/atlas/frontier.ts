/**
 * The weekly frontier note — one unvisited node a week, next to where the
 * household left off, pre-drafted (one-pager AND deep dive, so "Go deeper"
 * lands on a ready page) and delivered per the `atlasDelivery` setting.
 *
 * What counts as "visited" and "where we left off" is the SHARED atlas
 * memory, derived from the typed event log: the union over every player of
 * their `deriveTiers` seen-stamps, and the latest `open_node` across all
 * players. The legacy node columns (visitedAt, lastOpenedAt) are still
 * written by the visit route but are only read here when no character exists
 * yet — before the first player there are no events, only the columns.
 * `skipped` stays a node column and is read as such.
 *
 * Nothing here is a player action, so the note's own events
 * (`frontier_note`) are written per household player without calling the
 * game engine's onEventsLogged.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import {
  atlasFrontierPicks,
  atlasMaps,
  atlasNodes,
  children,
  type AtlasRungLevel,
} from "../../db/schema";
import { sendEmail } from "../email";
import { getSetting } from "../settings";
import { frontierLinks, renderFrontierEmail } from "./email";
import { eventsForPlayer, logEvent } from "./events";
import { deriveTiers, tierFor } from "./game";
import type { AtlasLlm } from "./llm";
import { pickFrontierNode, type FrontierNode } from "./picker";
import { listPlayers } from "./players";
import { ensureRung, rungFor, verifiedReadingsFor } from "./rungs";
import type { SendEmailFn } from "./preload";
import type { FetchLike } from "./verify";

export type PickRow = typeof atlasFrontierPicks.$inferSelect;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO date (YYYY-MM-DD, local calendar) of the Monday on or before `now`. */
export const weekStartOf = (now: Date): string => {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
};

/** The map the note draws from: the chosen one if still ready, else the oldest ready map. */
export const activeMapId = (db: DB): number | null => {
  const chosen = getSetting(db, "atlasActiveMapId");
  if (chosen !== null) {
    const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, chosen)).get();
    if (map?.status === "ready") return map.id;
  }
  const oldest = db
    .select({ id: atlasMaps.id })
    .from(atlasMaps)
    .where(eq(atlasMaps.status, "ready"))
    .orderBy(asc(atlasMaps.createdAt), asc(atlasMaps.id))
    .get();
  return oldest?.id ?? null;
};

/** The latest pick row for the week (a --force re-run adds a second one), or null. */
export const currentPick = (db: DB, weekStart: string): PickRow | null =>
  db
    .select()
    .from(atlasFrontierPicks)
    .where(eq(atlasFrontierPicks.weekStart, weekStart))
    .orderBy(desc(atlasFrontierPicks.id))
    .get() ?? null;

// --- shared atlas memory, from the event log ---------------------------------------

type NodeRow = typeof atlasNodes.$inferSelect;

/**
 * Which of a map's nodes the household has seen, and when each was last
 * opened — both from events, unioned across players. With no players there
 * are no events, so the legacy columns stand in (the one case they are read).
 */
export const householdMemory = (
  db: DB,
  nodes: readonly NodeRow[],
): { seen: Set<number>; lastOpened: Map<number, Date> } => {
  const seen = new Set<number>();
  const lastOpened = new Map<number, Date>();
  const players = listPlayers(db);

  if (players.length === 0) {
    for (const n of nodes) {
      if (n.visitedAt) seen.add(n.id);
      if (n.lastOpenedAt) lastOpened.set(n.id, n.lastOpenedAt);
    }
    return { seen, lastOpened };
  }

  const inMap = new Set(nodes.map((n) => n.id));
  for (const p of players) {
    const events = eventsForPlayer(db, p.id);
    const tiers = deriveTiers(events);
    for (const id of inMap) if (tierFor(tiers, id).seen) seen.add(id);
    for (const e of events) {
      if (e.verb !== "open_node" || e.nodeId === null || !inMap.has(e.nodeId)) continue;
      const prev = lastOpened.get(e.nodeId);
      if (!prev || e.createdAt > prev) lastOpened.set(e.nodeId, e.createdAt);
    }
  }
  return { seen, lastOpened };
};

const EPOCH = new Date(0);

const toFrontierNodes = (
  nodes: readonly NodeRow[],
  memory: { seen: Set<number>; lastOpened: Map<number, Date> },
): FrontierNode[] =>
  nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    position: n.position,
    skipped: n.skipped,
    visitedAt: memory.seen.has(n.id) ? (memory.lastOpened.get(n.id) ?? EPOCH) : null,
    lastOpenedAt: memory.lastOpened.get(n.id) ?? null,
    seedId: n.seedId,
  }));

/**
 * Did anyone open the pick's node since the note was made? An `open_node`
 * event for that node at or after the pick (any player). With no players
 * there are no events, so the legacy `openedAt` stamp answers.
 */
export const pickOpened = (db: DB, pick: PickRow): boolean => {
  const players = listPlayers(db);
  if (players.length === 0) return pick.openedAt !== null;
  for (const p of players) {
    const hit = eventsForPlayer(db, p.id).some(
      (e) => e.verb === "open_node" && e.nodeId === pick.nodeId && e.createdAt >= pick.createdAt,
    );
    if (hit) return true;
  }
  return false;
};

// --- the read-side view of a pick (GET route, digest) -----------------------------

export type PickView = {
  id: number;
  weekStart: string;
  reason: PickRow["reason"];
  deliveredVia: PickRow["deliveredVia"];
  createdAt: Date;
  opened: boolean;
  node: { id: number; title: string; hook: string | null; mapId: number; branchTitle: string | null };
  ready: { onepager: boolean; deepdive: boolean };
};

export const pickView = (db: DB, pick: PickRow): PickView | null => {
  const node = db.select().from(atlasNodes).where(eq(atlasNodes.id, pick.nodeId)).get();
  if (!node) return null;
  const parent =
    node.parentId === null
      ? null
      : (db.select().from(atlasNodes).where(eq(atlasNodes.id, node.parentId)).get() ?? null);
  const isReady = (level: AtlasRungLevel) => rungFor(db, node.id, level)?.status === "ready";
  return {
    id: pick.id,
    weekStart: pick.weekStart,
    reason: pick.reason,
    deliveredVia: pick.deliveredVia,
    createdAt: pick.createdAt,
    opened: pickOpened(db, pick),
    node: {
      id: node.id,
      title: node.title,
      hook: rungFor(db, node.id, "onepager")?.hook ?? null,
      mapId: node.mapId,
      branchTitle: parent?.title ?? null,
    },
    ready: { onepager: isReady("onepager"), deepdive: isReady("deepdive") },
  };
};

// --- the weekly run ---------------------------------------------------------------

export type FrontierDeps = {
  llm?: AtlasLlm;
  fetchImpl?: FetchLike;
  send?: SendEmailFn;
  now?: Date;
  /** Run again even if this week already has a pick (never repeats a node). */
  force?: boolean;
  log?: (msg: string) => void;
  baseUrl?: string;
};

export type FrontierRunResult =
  | { status: "no-map" }
  | { status: "already-delivered"; pick: PickRow }
  | { status: "complete"; mapId: number }
  | { status: "delivered"; pick: PickRow; via: "email" | "digest" | "app"; emailed: boolean }
  | { status: "failed"; error: string };

export const runWeeklyFrontier = async (
  db: DB,
  deps: FrontierDeps = {},
): Promise<FrontierRunResult> => {
  const log = deps.log ?? console.log;
  const now = deps.now ?? new Date();
  const weekStart = weekStartOf(now);

  // 1. a map to draw from
  const mapId = activeMapId(db);
  if (mapId === null) {
    log("no ready map — nothing to pick");
    return { status: "no-map" };
  }

  // 2. one note per week unless forced
  const existing = currentPick(db, weekStart);
  if (existing && !deps.force) {
    log(`already delivered: week ${weekStart} has pick #${existing.id} (node #${existing.nodeId})`);
    return { status: "already-delivered", pick: existing };
  }

  // 3. pick — the household's event log says where we left off; every node
  // ever picked is excluded, so a forced re-run moves on
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, mapId)).get()!;
  const nodes = db
    .select()
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, mapId))
    .orderBy(asc(atlasNodes.id))
    .all();
  const memory = householdMemory(db, nodes);
  const pickedIds = db
    .select({ nodeId: atlasFrontierPicks.nodeId })
    .from(atlasFrontierPicks)
    .all()
    .map((r) => r.nodeId);
  const choice = pickFrontierNode(toFrontierNodes(nodes, memory), { pickedIds });
  if (!choice) {
    log(`map #${mapId} "${map.title}" is complete — nothing left to pick`);
    return { status: "complete", mapId };
  }
  const node = nodes.find((n) => n.id === choice.nodeId)!;
  const parent = node.parentId === null ? null : (nodes.find((n) => n.id === node.parentId) ?? null);
  log(`pick: "${node.title}" (node #${node.id}) — reason ${choice.reason}, map "${map.title}"`);

  // 4. both rungs ready before anyone is told about it (never generated from a GET)
  const rungDeps = { llm: deps.llm, fetchImpl: deps.fetchImpl, log };
  const onepager = await ensureRung(db, node.id, "onepager", rungDeps);
  if (!onepager.ok) return { status: "failed", error: `one-pager: ${onepager.error}` };
  const deepdive = await ensureRung(db, node.id, "deepdive", rungDeps);
  // A deep dive that will not write must not sink the note: the email drops
  // its "Go deeper" button and the node page can still draft it on demand.
  if (!deepdive.ok) log(`deep dive failed (${deepdive.error}) — sending without "Go deeper"`);

  // 5. record the pick, then deliver
  const via = getSetting(db, "atlasDelivery");
  const pick = db
    .insert(atlasFrontierPicks)
    .values({
      mapId,
      nodeId: node.id,
      weekStart,
      reason: choice.reason,
      deliveredVia: via,
      createdAt: now,
    })
    .returning()
    .get();

  let delivered = pick;
  let emailed = false;
  if (via === "email") {
    const child = db.select().from(children).limit(1).get();
    const baseUrl = deps.baseUrl ?? process.env.SPROUT_BASE_URL ?? "http://localhost:3100";
    const links = frontierLinks(baseUrl, mapId, node.id);
    const email = renderFrontierEmail({
      childName: child?.name ?? null,
      map: { id: map.id, title: map.title },
      branch: parent ? { id: parent.id, title: parent.title } : null,
      node: { id: node.id, title: node.title },
      rung: { hook: onepager.rung.hook, bodyMd: onepager.rung.bodyMd ?? "" },
      readings: verifiedReadingsFor(db, node.id),
      links: deepdive.ok ? links : { ...links, deeper: null },
      progress: {
        visited: nodes.filter((n) => memory.seen.has(n.id)).length,
        total: nodes.length,
      },
    });
    // Only the send itself sits in the try: once Resend has accepted the
    // mail, withdrawing the pick would re-send the same note on a retry.
    let sent: Awaited<ReturnType<SendEmailFn>>;
    try {
      sent = await (deps.send ?? sendEmail)(email);
    } catch (err) {
      // Undeliverable means unpicked: drop the row so a retry can choose
      // (and mail) this node again; the rungs are already drafted.
      db.delete(atlasFrontierPicks).where(eq(atlasFrontierPicks.id, pick.id)).run();
      const message = err instanceof Error ? err.message : String(err);
      log(`email failed (${message}) — pick #${pick.id} withdrawn`);
      return { status: "failed", error: `email: ${message}` };
    }
    emailed = sent.sent;
    if (sent.sent) {
      try {
        delivered = db
          .update(atlasFrontierPicks)
          .set({ emailSentAt: now, resendId: sent.id })
          .where(eq(atlasFrontierPicks.id, pick.id))
          .returning()
          .get();
      } catch (err) {
        // The email is out; a failed stamp is a log line, never a failed run.
        log(`pick #${pick.id} sent but not stamped (${err instanceof Error ? err.message : String(err)})`);
      }
    }
  }
  // `digest`: the weekly digest's "This week in Atlas" section carries it;
  // `app`: the cards on /atlas and the home page are the whole delivery.

  // The note's own record. atlas_events.player_id is NOT NULL, so it is one
  // household-wide event per character; none while the table is empty.
  for (const p of listPlayers(db)) {
    logEvent(db, {
      playerId: p.id,
      verb: "frontier_note",
      mapId,
      nodeId: node.id,
      data: { pickId: pick.id, nodeId: node.id, weekStart, via, household: true },
      at: now,
    });
  }

  log(
    `delivered via ${via}${via === "email" ? (emailed ? " (sent)" : " (not sent — dry-run or no key)") : ""}: pick #${pick.id}`,
  );
  return { status: "delivered", pick: delivered, via, emailed };
};
