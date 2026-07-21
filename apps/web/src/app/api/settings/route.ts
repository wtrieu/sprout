import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { getSetting, setSetting, settingKeys, settingSchemas } from "@/lib/settings";

export const GET = () => {
  const all = Object.fromEntries(settingKeys.map((key) => [key, getSetting(db, key)]));
  return NextResponse.json({ settings: all });
};

const PutSchema = z.object({
  key: z.enum(settingKeys as [string, ...string[]]),
  value: z.unknown(),
});

export const PUT = async (req: NextRequest) => {
  const body = PutSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const key = body.data.key as keyof typeof settingSchemas;
  const value = settingSchemas[key].safeParse(body.data.value);
  if (!value.success) {
    return NextResponse.json({ error: value.error.message }, { status: 400 });
  }
  setSetting(db, key, value.data);
  return NextResponse.json({ key, value: value.data });
};
