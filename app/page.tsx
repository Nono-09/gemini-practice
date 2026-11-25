"use client";
import { useState } from "react";

interface UsageSummary {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function askGemini() {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setAnswer("読み込み中...");
    setUsage(null);
    setElapsedMs(null);

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "エラーが発生しました");
      if (data.usage) setUsage(data.usage);
      if (typeof data.elapsedMs === "number") setElapsedMs(data.elapsedMs);
    } catch {
      setAnswer("サーバーとの通信に失敗しました。VS Codeのターミナルのエラーを確認してください");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl m-4 rounded-xl bg-white p-6 shadow">
      <textarea
        rows={4}
        className="w-full rounded-lg border border-gray-400 p-3 text-black focus:border-blue-500 focus:outline-none"
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

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-500 font-mono">
          入力: {prompt.length} 文字
        </span>
        <button
          type="button"
          disabled={!prompt.trim() || isLoading}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          onClick={askGemini}
        >
          {isLoading ? "送信中..." : "送信"}
        </button>
      </div>

      <div className="mt-4 min-h-32 rounded-lg bg-gray-100 p-4 text-black whitespace-pre-wrap break-words">
        {answer}
      </div>

      {(usage || elapsedMs !== null) && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
          {usage && (
            <>
              <span className="rounded bg-gray-200 px-2 py-1 font-mono">
                入力: {usage.promptTokenCount.toLocaleString()} tok
              </span>
              <span className="rounded bg-gray-200 px-2 py-1 font-mono">
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