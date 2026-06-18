import { NextResponse } from "next/server";
import { z } from "zod";
import { validationErrorResponse } from "@/lib/api";
import { pickBgm, scanBgmLibrary } from "@/lib/bgm/library";

export const runtime = "nodejs";

const pickSchema = z.object({
  mood: z.string().min(1),
  fallbackFirst: z.coerce.boolean().default(false)
});

export async function GET() {
  const library = await scanBgmLibrary();
  return NextResponse.json({
    count: library.length,
    entries: library.map((entry) => ({
      relativePath: entry.relativePath,
      fileName: entry.fileName,
      moodTags: entry.moodTags
    }))
  });
}

export async function POST(request: Request) {
  const parsed = pickSchema.safeParse(await request.json());
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }
  const library = await scanBgmLibrary();
  const result = pickBgm(library, parsed.data.mood, { fallbackFirst: parsed.data.fallbackFirst });
  return NextResponse.json({
    libraryCount: library.length,
    mood: parsed.data.mood,
    pick: result.pick,
    score: result.score,
    matchedKeywords: result.matchedKeywords,
    nextActions: result.nextActions,
    rankings: result.rankings.slice(0, 5).map((row) => ({
      relativePath: row.entry.relativePath,
      score: row.score,
      matched: row.matched
    }))
  });
}
