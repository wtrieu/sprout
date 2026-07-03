/** Weekly digest email. Run via: pnpm --filter web run job:digest */
import { db } from "../apps/web/src/db/client";
import { runWeeklyDigest } from "../apps/web/src/lib/digest";

runWeeklyDigest(db)
  .then((msg) => console.log(msg))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
