"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  buildSystemInstruction,
  GEMINI_MODEL,
  LENGTH_OPTIONS,
  PROMPT_TEMPLATES,
  SYSTEM_PRESETS,
  type ChatMessage,
  type OutputLength,
  type UsageSummary,
} from "@/lib/gemini-config";

const SAMPLE_QUESTIONS = [
  "LLMのTransformerの仕組みを初心者にもわかりやすく教えて。",
  "Next.jsのClient ComponentとServer Componentの違いを表でまとめて。",
  "TypeScriptで非同期処理（async/await）を書くときのベストプラクティスは？",
];

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: UsageSummary; elapsedMs: number }
  | { type: "error"; error: string };

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState(
    SYSTEM_PRESETS[0].id
  );
  const [systemPrompt, setSystemPrompt] = useState(
    SYSTEM_PRESETS[0].instruction
  );
  const [outputLength, setOutputLength] = useState<OutputLength>("normal");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [tokenEstimate, setTokenEstimate] = useState<{
    key: string;
    value: number;
  } | null>(null);
  const [countErrorState, setCountErrorState] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveSystemInstruction = useMemo(
    () => buildSystemInstruction(systemPrompt, outputLength),
    [systemPrompt, outputLength]
  );

  const estimateKey = `${messages.length}:${effectiveSystemInstruction ?? ""}:${prompt}`;
  const estimatedTokens =
    tokenEstimate?.key === estimateKey ? tokenEstimate.value : null;
  const countError =
    countErrorState?.key === estimateKey ? countErrorState.message : null;

  const totalSessionUsage = useMemo(() => {
    return messages.reduce(
      (acc, msg) => {
        if (!msg.usage) return acc;
        return {
          prompt: acc.prompt + msg.usage.promptTokenCount,
          candidates: acc.candidates + msg.usage.candidatesTokenCount,
          total: acc.total + msg.usage.totalTokenCount,
        };
      },
      { prompt: 0, candidates: 0, total: 0 }
    );
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSelectPreset(presetId: string) {
    const found = SYSTEM_PRESETS.find((item) => item.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setSystemPrompt(found.instruction);
  }

  function handleApplyTemplate(templateText: string) {
    setPrompt((prev) => (prev.trim() ? `${templateText}${prev}` : templateText));
    textareaRef.current?.focus();
  }

  async function handleCopyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // クリップボード権限がない環境では無視
    }
  }

  async function handleCountTokens() {
    if (!prompt.trim() || isCounting || isLoading) return;
    const requestKey = estimateKey;
    setIsCounting(true);
    setCountErrorState(null);

    try {
      const res = await fetch("/api/gemini/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({
            role: m.role,
            text: m.text,
            isError: m.isError,
          })),
          prompt,
          systemInstruction: effectiveSystemInstruction,
        }),
      });
      const data = (await res.json()) as {
        totalTokens?: number;
        error?: string;
      };
      if (!res.ok || data.error) {
        setCountErrorState({
          key: requestKey,
          message: data.error ?? "トークン計測に失敗しました",
        });
      } else {
        setTokenEstimate({
          key: requestKey,
          value: data.totalTokens ?? 0,
        });
      }
    } catch {
      setCountErrorState({
        key: requestKey,
        message: "トークン計測の通信に失敗しました",
      });
    } finally {
      setIsCounting(false);
    }
  }

  function handleStopGeneration() {
    abortControllerRef.current?.abort();
  }

  function handleClearChat() {
    if (isLoading) {
      abortControllerRef.current?.abort();
    }
    setMessages([]);
    setTokenEstimate(null);
    setCountErrorState(null);
  }

  async function askGemini(overridePrompt?: string) {
    const targetPrompt = (overridePrompt ?? prompt).trim();
    if (!targetPrompt || isLoading) return;

    const historySnapshot = messages.map((m) => ({
      role: m.role,
      text: m.text,
      isError: m.isError,
    }));

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text: targetPrompt,
    };
    const modelMessageId = createId();
    const initialModelMessage: ChatMessage = {
      id: modelMessageId,
      role: "model",
      text: "",
    };

    setMessages((prev) => [...prev, userMessage, initialModelMessage]);
    if (!overridePrompt) {
      setPrompt("");
    }
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const updateModelMessage = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === modelMessageId ? updater(msg) : msg))
      );
    };

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: historySnapshot,
          prompt: targetPrompt,
          systemInstruction: effectiveSystemInstruction,
        }),
      });

      if (!res.ok || !res.body) {
        let errorMessage = `サーバーエラー (HTTP ${res.status})`;
        try {
          const errJson = (await res.json()) as { error?: string };
          if (errJson.error) errorMessage = errJson.error;
        } catch {
          // JSONパース不能時はデフォルト文を使用
        }
        updateModelMessage((msg) => ({
          ...msg,
          text: errorMessage,
          isError: true,
        }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEventLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as StreamEvent;
        if (event.type === "delta") {
          updateModelMessage((msg) => ({
            ...msg,
            text: msg.text + event.text,
          }));
        } else if (event.type === "done") {
          updateModelMessage((msg) => ({
            ...msg,
            usage: event.usage,
            elapsedMs: event.elapsedMs,
          }));
        } else if (event.type === "error") {
          updateModelMessage((msg) => ({
            ...msg,
            text: msg.text
              ? `${msg.text}\n\n---\n**エラー**: ${event.error}`
              : event.error,
            isError: true,
          }));
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          handleEventLine(line);
        }
      }

      if (buffer.trim()) {
        handleEventLine(buffer);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        updateModelMessage((msg) => ({
          ...msg,
          text: msg.text
            ? `${msg.text}\n\n*(生成を停止しました)*`
            : "*(生成を停止しました)*",
        }));
      } else {
        updateModelMessage((msg) => ({
          ...msg,
          text: "サーバーとの通信に失敗しました。VS Codeのターミナルのエラーを確認してください",
          isError: true,
        }));
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      {/* ヘッダー */}
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              gemini-practice
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-xs font-medium text-blue-700 border border-blue-200">
              {GEMINI_MODEL}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
              <span>累計トークン:</span>
              <span className="font-mono font-semibold text-slate-800">
                入力 {totalSessionUsage.prompt.toLocaleString()}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-mono font-semibold text-slate-800">
                出力 {totalSessionUsage.candidates.toLocaleString()}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-mono font-semibold text-blue-700">
                計 {totalSessionUsage.total.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className={`rounded-lg border px-3 py-1.5 font-medium transition-colors ${
                isSettingsOpen
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {isSettingsOpen ? "プロンプト設定を閉じる" : "プロンプト設定"}
            </button>

            <button
              type="button"
              onClick={handleClearChat}
              disabled={messages.length === 0 && !isLoading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              会話をクリア
            </button>
          </div>
        </div>

        {/* システムプロンプト & 出力設定バー */}
        <div className="mx-auto mt-2.5 max-w-5xl space-y-2 border-t border-slate-100 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500 mr-1">
                役割:
              </span>
              {SYSTEM_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedPresetId === preset.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
              <span className="px-2 text-xs font-medium text-slate-500">
                長さ:
              </span>
              {LENGTH_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOutputLength(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    outputLength === opt.id
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {isSettingsOpen && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label
                htmlFor="system-prompt-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                システムプロンプト（AIへの事前指示・自由編集可）
              </label>
              <textarea
                id="system-prompt-input"
                rows={2}
                value={systemPrompt}
                onChange={(e) => {
                  setSelectedPresetId("custom");
                  setSystemPrompt(e.target.value);
                }}
                placeholder="例：箇条書きで端的に回答してください"
                className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs sm:text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </header>

      {/* チャット履歴エリア */}
      <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          {messages.length === 0 ? (
            <div className="my-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs">
              <h2 className="text-base font-bold text-slate-800">
                Gemini チャットへようこそ
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Markdown・数式・コードの整形表示、ストリーミング出力、入出力トークン可視化、システムプロンプト切替に対応しています。
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SAMPLE_QUESTIONS.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => askGemini(sample)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs sm:text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isStreamingThis =
                isLoading &&
                msg.role === "model" &&
                index === messages.length - 1;

              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm sm:text-base text-white shadow-xs whitespace-pre-wrap break-words">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex justify-start">
                  <div
                    className={`w-full max-w-[95%] sm:max-w-[88%] rounded-2xl rounded-bl-sm border px-4 py-3 shadow-xs ${
                      msg.isError
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-slate-200 bg-white text-slate-900"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-xs font-semibold text-slate-500">
                        Gemini
                        {isStreamingThis && (
                          <span className="ml-2 inline-block animate-pulse text-blue-600">
                            生成中...
                          </span>
                        )}
                      </span>
                      {msg.text && (
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          {copiedId === msg.id ? "コピー済み" : "回答をコピー"}
                        </button>
                      )}
                    </div>

                    {msg.text ? (
                      <MarkdownRenderer content={msg.text} />
                    ) : (
                      <p className="text-sm text-slate-500 animate-pulse">
                        読み込み中...
                      </p>
                    )}

                    {(msg.usage || msg.elapsedMs !== undefined) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                        {msg.usage && (
                          <>
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">
                              入力: {msg.usage.promptTokenCount.toLocaleString()} tok
                            </span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">
                              出力: {msg.usage.candidatesTokenCount.toLocaleString()} tok
                            </span>
                            {msg.usage.thoughtsTokenCount > 0 && (
                              <span className="rounded bg-purple-50 px-2 py-0.5 font-mono text-purple-700">
                                思考: {msg.usage.thoughtsTokenCount.toLocaleString()} tok
                              </span>
                            )}
                            <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-medium text-blue-700">
                              合計: {msg.usage.totalTokenCount.toLocaleString()} tok
                            </span>
                          </>
                        )}
                        {msg.elapsedMs !== undefined && (
                          <span className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-700">
                            {(msg.elapsedMs / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* 入力エリア */}
      <footer className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-5xl space-y-2">
          {/* 定型プロンプトテンプレート */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 mr-1">
              テンプレート:
            </span>
            {PROMPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={isLoading}
                onClick={() => handleApplyTemplate(tpl.text)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                + {tpl.label}
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            rows={3}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            placeholder="Geminiへの質問を入力してください（Ctrl + Enter / Cmd + Enter で送信）"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                askGemini();
              }
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{prompt.length} 文字</span>
              <button
                type="button"
                disabled={!prompt.trim() || isCounting || isLoading}
                onClick={handleCountTokens}
                className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isCounting ? "計測中..." : "送信前トークン計測"}
              </button>
              {estimatedTokens !== null && (
                <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-medium text-blue-700">
                  推定入力（履歴・システム指示含む）: {estimatedTokens.toLocaleString()} tok
                </span>
              )}
              {countError && (
                <span className="text-red-600">{countError}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isLoading ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!prompt.trim()}
                  onClick={() => askGemini()}
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  送信
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}