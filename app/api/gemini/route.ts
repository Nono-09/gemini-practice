import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  buildGeminiContents,
  extractGeminiErrorMessage,
  resolveGeminiModel,
  type UsageSummary,
} from "@/lib/gemini-config";

interface RequestPayload {
  model?: string;
  prompt?: string;
  messages?: Array<{ role: "user" | "model"; text: string; isError?: boolean }>;
  systemInstruction?: string;
}

function encodeNdjsonLine(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload) + "\n");
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

    const targetModel = resolveGeminiModel(body.model);
    const systemInstruction = body.systemInstruction?.trim() || undefined;
    const startedAt = Date.now();

    const responseStream = await ai.models.generateContentStream({
      model: targetModel,
      contents,
      config: {
        abortSignal: request.signal,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let latestUsage: UsageSummary = {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          thoughtsTokenCount: 0,
          totalTokenCount: 0,
        };

        try {
          for await (const chunk of responseStream) {
            if (request.signal.aborted) break;

            if (chunk.usageMetadata) {
              latestUsage = {
                promptTokenCount: chunk.usageMetadata.promptTokenCount ?? 0,
                candidatesTokenCount:
                  chunk.usageMetadata.candidatesTokenCount ?? 0,
                thoughtsTokenCount: chunk.usageMetadata.thoughtsTokenCount ?? 0,
                totalTokenCount: chunk.usageMetadata.totalTokenCount ?? 0,
              };
            }

            if (chunk.text) {
              controller.enqueue(
                encodeNdjsonLine({ type: "delta", text: chunk.text })
              );
            }
          }

          controller.enqueue(
            encodeNdjsonLine({
              type: "done",
              usage: latestUsage,
              elapsedMs: Date.now() - startedAt,
            })
          );
          controller.close();
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }
          controller.enqueue(
            encodeNdjsonLine({
              type: "error",
              error: extractGeminiErrorMessage(error),
            })
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: extractGeminiErrorMessage(error) },
      { status: 500 }
    );
  }
}