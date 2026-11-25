import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  buildGeminiContents,
  extractGeminiErrorMessage,
  resolveGeminiModel,
} from "@/lib/gemini-config";

interface CountPayload {
  model?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "model"; text: string; isError?: boolean }>;
  systemInstruction?: string;
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEYが設定されていません。.env.localを確認し、npm run devを再起動してください",
      },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as CountPayload;
    const contents = buildGeminiContents(body.messages ?? [], body.prompt);

    if (contents.length === 0) {
      return NextResponse.json({ totalTokens: 0 });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const targetModel = resolveGeminiModel(body.model);
    const systemInstruction = body.systemInstruction?.trim() || undefined;
    const result = await ai.models.countTokens({
      model: targetModel,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    return NextResponse.json({
      totalTokens: result.totalTokens ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: extractGeminiErrorMessage(error) },
      { status: 500 }
    );
  }
}