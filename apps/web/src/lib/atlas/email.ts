/**
 * Atlas email rendering — pure functions from rows to { subject, html }, so
 * tests never need a network. Sending stays in lib/email.ts (sendEmail), and
 * EMAIL_DRY_RUN=true logs instead of sending.
 */
import { mdToHtml } from "../email";

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
