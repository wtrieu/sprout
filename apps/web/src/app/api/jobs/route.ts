import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { isLocked } from "@/lib/jobs";

export const GET = () => {
  const recent = db.select().from(jobs).orderBy(desc(jobs.id)).limit(100).all();
  return NextResponse.json({ running: isLocked(db), jobs: recent });
};
