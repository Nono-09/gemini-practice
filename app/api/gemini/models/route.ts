import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  DEFAULT_MODEL_OPTIONS,
  extractGeminiErrorMessage,
  type ModelOption,
} from "@/lib/gemini-config";

export async function GET() {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEYが設定されていません" },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const pager = await ai.models.list();
    const map = new Map<string, ModelOption>();

    for await (const model of pager) {
      const id = model.name?.replace(/^models\//, "");
      if (!id || !id.startsWith("gemini-")) continue;
      if (!model.supportedActions?.includes("generateContent")) continue;
      if (id.includes("tts") || id.includes("image") || id.includes("audio")) {
        continue;
      }

      if (!map.has(id)) {
        map.set(id, {
          id,
          displayName: model.displayName || id,
        });
      }
    }

    const models =
      map.size > 0
        ? Array.from(map.values()).sort((a, b) => b.id.localeCompare(a.id))
        : DEFAULT_MODEL_OPTIONS;

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: extractGeminiErrorMessage(error) },
      { status: 500 }
    );
  }
}