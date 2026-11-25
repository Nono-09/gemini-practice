"use client";

import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function normalizeMathDelimiters(markdown: string): string {
  // コードブロック内の記述を壊さないよう、``` で囲まれた領域は変換対象から外す
  const segments = markdown.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return segment
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, expr: string) => `$$${expr}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, expr: string) => `$${expr}$`);
    })
    .join("");
}

function CodeBlock({
  language,
  code,
}: {
  language?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // クリップボード権限がない環境では無視
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
        <span className="font-mono">{language || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100 hover:bg-slate-600 transition-colors"
        >
          {copied ? "コピー済み" : "コピー"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mt-4 mb-2 border-b border-slate-200 pb-1 text-xl font-bold text-slate-900 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-2 border-b border-slate-100 pb-1 text-lg font-bold text-slate-900 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-base font-bold text-slate-900 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1 text-sm font-bold text-slate-800 first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2 leading-7 text-slate-800 first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-6 text-slate-800">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-6 text-slate-800">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-blue-400 bg-blue-50/60 px-3 py-2 text-slate-700">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-200" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800 break-all"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-100 text-slate-800">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-slate-200 px-3 py-2 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-100 px-3 py-2 align-top">
      {children}
    </td>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-([\w-]+)/.exec(className || "");
    const rawText = String(children).replace(/\n$/, "");
    const isBlock = Boolean(match) || rawText.includes("\n");

    if (isBlock) {
      return <CodeBlock language={match?.[1]} code={rawText} />;
    }

    return (
      <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[0.875em] text-slate-900">
        {children}
      </code>
    );
  },
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
}: {
  content: string;
}) {
  const normalized = normalizeMathDelimiters(content);

  return (
    <div className="text-sm sm:text-base break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
});