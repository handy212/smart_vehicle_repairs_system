import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/** Bust server-cached branding metadata after admin uploads or saves. */
export async function POST() {
  revalidateTag("branding", "max");
  return NextResponse.json({ revalidated: true });
}
