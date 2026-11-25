import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  buildGeminiContents,
  extractGeminiErrorMessage,
  GEMINI_MODEL,
} from "@/lib/gemini-config";

interface RequestPayload {
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
    const body = (await request.json()) as RequestPayload;
    const contents = buildGeminiContents(body.messages ?? [], body.prompt);

    if (contents.length === 0) {
      return NextResponse.json(
        { error: "質問を入力してください" },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const systemInstruction = body.systemInstruction?.trim() || undefined;
    const startedAt = Date.now();

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    return NextResponse.json({
      answer: response.text,
      usage: {
        promptTokenCount: response.usageMetadata?.promptTokenCount ?? 0,
        candidatesTokenCount:
          response.usageMetadata?.candidatesTokenCount ?? 0,
        thoughtsTokenCount: response.usageMetadata?.thoughtsTokenCount ?? 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount ?? 0,
      },
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: extractGeminiErrorMessage(error) },
      { status: 500 }
    );
  }
}