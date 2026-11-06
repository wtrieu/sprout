/**
 * Atlas email rendering — pure functions from rows to { subject, html }, so
 * tests never need a network. Sending stays in lib/email.ts (sendEmail), and
 * EMAIL_DRY_RUN=true logs instead of sending.
 */
import { mdToHtml } from "../email";
import { stripVisualMarkers } from "./visuals";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type MapReadyStart = { nodeId: number; title: string; hook: string | null };

export type MapReadyEmailInput = {
  map: { id: number; title: string; blurb: string | null };
  branchCount: number;
  nodeCount: number;
  readyCount: number;
  failedCount: number;
  /** First unvisited child of the first three branches, with its hook. */
  starts: MapReadyStart[];
  baseUrl: string;
};

/** The one "your map is ready" email a preload sends when every one-pager landed. */
export const renderMapReadyEmail = (
  input: MapReadyEmailInput,
): { subject: string; html: string } => {
  const { map, baseUrl } = input;
  const mapUrl = `${baseUrl}/atlas/${map.id}`;
  const counts =
    `${input.readyCount} of ${input.nodeCount} one-pagers ready across ${input.branchCount} branches` +
    (input.failedCount > 0
      ? ` · ${input.failedCount} failed — regenerate them from the map page`
      : "");

  const starts = input.starts
    .slice(0, 3)
    .map(
      (s) =>
        `<li style="margin:0 0 10px"><a href="${mapUrl}/${s.nodeId}" style="color:#b45309;font-weight:600;text-decoration:none">${esc(s.title)}</a>${
          s.hook ? `<br><span style="color:#525252;font-size:14px">${esc(s.hook)}</span>` : ""
        }</li>`,
    )
    .join("\n");

  const html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;color:#171717;line-height:1.5">
  <p style="color:#737373;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px">Atlas</p>
  <h1 style="font-size:22px;margin:0 0 8px">${esc(map.title)} is ready</h1>
  ${map.blurb ? `<div style="color:#404040;font-size:15px">${mdToHtml(map.blurb)}</div>` : ""}
  <p style="color:#525252;font-size:14px">${counts}.</p>
  ${
    starts
      ? `<p style="font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 8px">Start here</p>
  <ul style="list-style:none;padding:0;margin:0">\n${starts}\n  </ul>`
      : ""
  }
  <p style="margin:24px 0 0"><a href="${mapUrl}" style="display:inline-block;background:#f59e0b;color:#171717;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;text-decoration:none">Open the map</a></p>
</div>`;

  return { subject: `Atlas · ${map.title} is ready`, html };
};

// --- the weekly frontier note ----------------------------------------------------

/** `deeper` is null when the deep dive failed to write — the button is dropped. */
export type FrontierEmailLinks = { open: string; deeper: string | null; save: string; skip: string };

/**
 * The note's GET links (pages behind Cloudflare Access). `from=note` makes
 * the visit beacon log the open as coming from the note; the node page
 * pre-opens its skip confirm bar on `action=skip` and its save panel on
 * `action=save` (PR3).
 */
export const frontierLinks = (baseUrl: string, mapId: number, nodeId: number): FrontierEmailLinks => {
  const page = `${baseUrl.replace(/\/+$/, "")}/atlas/${mapId}/${nodeId}`;
  return {
    open: `${page}?from=note`,
    deeper: `${page}?rung=deepdive&from=note`,
    save: `${page}?action=save&from=note`,
    skip: `${page}?action=skip&from=note`,
  };
};

export type FrontierEmailInput = {
  /** From `children.name` — the "Save for <child>" button's label. */
  childName: string | null;
  map: { id: number; title: string };
  /** The node's branch; null when the node is itself a branch. */
  branch: { id: number; title: string } | null;
  node: { id: number; title: string };
  rung: { hook: string | null; bodyMd: string };
  /** Verified readings only — the caller never passes rejected rows. */
  readings: Array<{ title: string; url: string | null; author?: string | null; why?: string | null }>;
  links: FrontierEmailLinks;
  /** Event-derived: nodes the household has seen, out of the map's total. */
  progress: { visited: number; total: number };
};

const button = (href: string, label: string, primary: boolean): string =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;text-decoration:none;${
    primary ? "background:#f59e0b;color:#171717" : "background:#f5f5f4;color:#404040;border:1px solid #d6d3d1"
  }">${esc(label)}</a>`;

/** The weekly note: the whole one-pager inside, plus Read next and the action links. */
export const renderFrontierEmail = (
  input: FrontierEmailInput,
): { subject: string; html: string } => {
  const { map, branch, node, rung, links, progress } = input;
  const eyebrow = `This week in Atlas · ${esc(map.title)}${branch ? ` › ${esc(branch.title)}` : ""}`;

  const readings = input.readings
    .filter((r) => r.url && /^https?:\/\//.test(r.url))
    .map(
      (r) =>
        `<li style="margin:0 0 8px"><a href="${esc(r.url!)}" style="color:#b45309;font-weight:600;text-decoration:none">${esc(r.title)}</a>${
          r.author ? ` <span style="color:#737373;font-size:14px">· ${esc(r.author)}</span>` : ""
        }${r.why ? `<br><span style="color:#525252;font-size:14px">${esc(r.why)}</span>` : ""}</li>`,
    )
    .join("\n");

  const html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;color:#171717;line-height:1.55">
  <p style="color:#737373;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 4px">${eyebrow}</p>
  <h1 style="font-size:24px;margin:0 0 8px">${esc(node.title)}</h1>
  ${rung.hook ? `<p style="font-size:16px;margin:0 0 16px"><strong>${esc(rung.hook)}</strong></p>` : ""}
  <div style="font-size:15px;color:#262626">${mdToHtml(stripVisualMarkers(rung.bodyMd))}</div>
  ${
    readings
      ? `<p style="font-size:13px;color:#737373;text-transform:uppercase;letter-spacing:.05em;margin:24px 0 8px">Read next</p>
  <ul style="list-style:none;padding:0;margin:0">\n${readings}\n  </ul>`
      : ""
  }
  <p style="margin:24px 0 0">${button(links.open, "Open in Atlas", true)}${links.deeper ? button(links.deeper, "Go deeper", false) : ""}${button(links.save, `Save for ${input.childName ?? "the child"}`, false)}${button(links.skip, "Skip this branch", false)}</p>
  <p style="color:#a3a3a3;font-size:12px;margin:20px 0 0">${progress.visited}/${progress.total} visited</p>
</div>`;

  return { subject: `Atlas · ${node.title}`, html };
};
