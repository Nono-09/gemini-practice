"use client";

import { useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  buildSystemInstruction,
  GEMINI_MODEL,
  LENGTH_OPTIONS,
  PROMPT_TEMPLATES,
  SYSTEM_PRESETS,
  type OutputLength,
  type UsageSummary,
} from "@/lib/gemini-config";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

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
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const effectiveSystemInstruction = useMemo(
    () => buildSystemInstruction(systemPrompt, outputLength),
    [systemPrompt, outputLength]
  );

  const estimateKey = `${effectiveSystemInstruction ?? ""}:${prompt}`;
  const estimatedTokens =
    tokenEstimate?.key === estimateKey ? tokenEstimate.value : null;
  const countError =
    countErrorState?.key === estimateKey ? countErrorState.message : null;

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

  async function handleCopyAnswer() {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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

  async function askGemini() {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setAnswer("");
    setUsage(null);
    setElapsedMs(null);
    setCopied(false);

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          systemInstruction: effectiveSystemInstruction,
        }),
      });

      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "エラーが発生しました");
      if (data.usage) setUsage(data.usage);
      if (typeof data.elapsedMs === "number") setElapsedMs(data.elapsedMs);
    } catch {
      setAnswer(
        "サーバーとの通信に失敗しました。VS Codeのターミナルのエラーを確認してください"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl m-4 rounded-xl bg-white p-6 shadow space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-slate-900">gemini-practice</h1>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-mono text-xs text-blue-700">
            {GEMINI_MODEL}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsSettingsOpen((prev) => !prev)}
          className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
            isSettingsOpen
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {isSettingsOpen ? "プロンプト設定を閉じる" : "プロンプト設定"}
        </button>
      </div>

      {/* 役割プリセット & 出力長さ */}
      <div className="space-y-2">
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
              システムプロンプト（自由編集可）
            </label>
            <textarea
              id="system-prompt-input"
              rows={2}
              value={systemPrompt}
              onChange={(e) => {
                setSelectedPresetId("custom");
                setSystemPrompt(e.target.value);
              }}
              className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs sm:text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* テンプレートボタン */}
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
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            + {tpl.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        rows={4}
        className="w-full rounded-lg border border-slate-300 p-3 text-slate-900 focus:border-blue-500 focus:outline-none"
        placeholder="Geminiへの質問を入力してください（Ctrl + Enter で送信）"
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
            className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCounting ? "計測中..." : "送信前トークン計測"}
          </button>
          {estimatedTokens !== null && (
            <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-medium text-blue-700">
              推定入力（システム指示含む）: {estimatedTokens.toLocaleString()} tok
            </span>
          )}
          {countError && <span className="text-red-600">{countError}</span>}
        </div>

        <button
          type="button"
          disabled={!prompt.trim() || isLoading}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          onClick={askGemini}
        >
          {isLoading ? "送信中..." : "送信"}
        </button>
      </div>

      {(isLoading || answer) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-black">
          <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5">
            <span className="text-xs font-semibold text-slate-500">Gemini</span>
            {answer && !isLoading && (
              <button
                type="button"
                onClick={handleCopyAnswer}
                className="rounded border border-slate-300 bg-white px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                {copied ? "コピー済み" : "回答をコピー"}
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500 animate-pulse">読み込み中...</p>
          ) : (
            <MarkdownRenderer content={answer} />
          )}
        </div>
      )}

      {(usage || elapsedMs !== null) && (
        <div className="flex flex-wrap gap-2 text-xs text-slate-700">
          {usage && (
            <>
              <span className="rounded bg-slate-200 px-2 py-1 font-mono">
                入力: {usage.promptTokenCount.toLocaleString()} tok
              </span>
              <span className="rounded bg-slate-200 px-2 py-1 font-mono">
                出力: {usage.candidatesTokenCount.toLocaleString()} tok
              </span>
              {usage.thoughtsTokenCount > 0 && (
                <span className="rounded bg-purple-100 px-2 py-1 font-mono text-purple-800">
                  思考: {usage.thoughtsTokenCount.toLocaleString()} tok
                </span>
              )}
              <span className="rounded bg-blue-100 px-2 py-1 font-mono font-semibold text-blue-800">
                合計: {usage.totalTokenCount.toLocaleString()} tok
              </span>
            </>
          )}
          {elapsedMs !== null && (
            <span className="rounded bg-emerald-100 px-2 py-1 font-mono text-emerald-800">
              {(elapsedMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}