/**
 * The week's frontier pick is claimed before its rungs draft, so the row
 * exists for minutes while the one-pager is still being written (the row is
 * the job status — the one-pager rung's, via `pickView`'s ready flags). Until
 * it is ready the pick is shown as preparing, never as something to open:
 * clicking through early would log an open_node on an undrafted node. A
 * failed one-pager withdraws the pick, so "not ready" only ever means drafting.
 */
export type PickReadiness = { ready: { onepager: boolean } };

export const pickReadable = (pick: PickReadiness | null | undefined): boolean =>
  pick?.ready.onepager === true;

export const PICK_PREPARING_COPY = "Preparing this week’s pick — it takes a few minutes.";
