import { useState, type ReactNode } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ResultTab = "json" | "metadata" | "content"
type ContentFormat = "markdown" | "html"

interface ParseResultViewerProps {
  result: unknown
  preferredFormat: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function responseData(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) return {}
  return isRecord(result.data) ? result.data : result
}

function JsonViewer({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2) ?? String(value)
  const tokenPattern = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of json.matchAll(tokenPattern)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push(json.slice(cursor, index))
    const token = match[0]
    const className = match[1]
      ? "text-info-fg"
      : match[2]
        ? "text-success-fg"
        : /true|false|null/i.test(token)
          ? "text-warning-fg"
          : "text-danger-fg"
    nodes.push(
      <span className={className} key={`${index}-${token}`}>
        {token}
      </span>,
    )
    cursor = index + token.length
  }
  if (cursor < json.length) nodes.push(json.slice(cursor))

  return (
    <pre className="max-h-[600px] overflow-auto rounded-lg bg-surface-1 p-4 text-xs font-mono leading-5 text-foreground">
      {nodes}
    </pre>
  )
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g
  const nodes: ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push(text.slice(cursor, index))
    const token = match[0]
    if (token.startsWith("**")) {
      nodes.push(<strong key={index}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith("`")) {
      nodes.push(
        <code className="rounded bg-surface-4 px-1 py-0.5 font-mono text-[0.9em]" key={index}>
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith("[")) {
      const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      const href = parts?.[2] ?? ""
      nodes.push(
        /^https?:\/\//i.test(href) ? (
          <a className="text-info-fg underline underline-offset-2" href={href} key={index} rel="noreferrer" target="_blank">
            {parts?.[1]}
          </a>
        ) : (
          <span key={index}>{parts?.[1] ?? token}</span>
        ),
      )
    } else {
      nodes.push(<em key={index}>{token.slice(1, -1)}</em>)
    }
    cursor = index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function markdownTableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

function isMarkdownTableDivider(line: string): boolean {
  const cells = markdownTableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function MarkdownViewer({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n")
  const blocks: ReactNode[] = []
  let codeLines: string[] | null = null
  let codeLanguage = ""

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = /^```(.*)$/.exec(line)
    if (fence) {
      if (codeLines === null) {
        codeLines = []
        codeLanguage = fence[1].trim()
      } else {
        blocks.push(
          <div key={`code-${index}`}>
            {codeLanguage && <div className="rounded-t-md bg-surface-4 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{codeLanguage}</div>}
            <pre className={cn("overflow-x-auto bg-surface-1 p-3 font-mono text-xs", codeLanguage ? "rounded-b-md" : "rounded-md")}>
              <code>{codeLines.join("\n")}</code>
            </pre>
          </div>,
        )
        codeLines = null
        codeLanguage = ""
      }
      continue
    }
    if (codeLines !== null) {
      codeLines.push(line)
      continue
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableDivider(lines[index + 1])) {
      const headers = markdownTableCells(line)
      const rows: string[][] = []
      let rowIndex = index + 2
      while (rowIndex < lines.length && lines[rowIndex].includes("|") && lines[rowIndex].trim()) {
        rows.push(markdownTableCells(lines[rowIndex]))
        rowIndex += 1
      }
      blocks.push(
        <div className="overflow-x-auto rounded-md border border-white/[0.08]" key={`table-${index}`}>
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-surface-3">
              <tr>{headers.map((header, cellIndex) => <th className="border-b border-white/[0.08] px-3 py-2 font-semibold" key={cellIndex}>{renderInlineMarkdown(header)}</th>)}</tr>
            </thead>
            <tbody>{rows.map((row, rowNumber) => <tr className="border-b border-white/[0.06] last:border-0" key={rowNumber}>{headers.map((_, cellIndex) => <td className="px-3 py-2 align-top" key={cellIndex}>{renderInlineMarkdown(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      index = rowIndex - 1
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        <div className={cn("font-semibold text-foreground", level === 1 ? "mt-5 text-xl" : level === 2 ? "mt-4 text-lg" : "mt-3 text-base")} key={index}>
          {renderInlineMarkdown(heading[2])}
        </div>,
      )
    } else if (bullet || ordered) {
      blocks.push(
        <div className="flex gap-2 pl-3" key={index}>
          <span className="text-muted-foreground">{ordered ? `${line.trim().split(".")[0]}.` : "•"}</span>
          <span>{renderInlineMarkdown((bullet ?? ordered)?.[1] ?? "")}</span>
        </div>,
      )
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote className="border-l-2 border-info-fg/50 pl-3 text-muted-foreground" key={index}>{renderInlineMarkdown(line.slice(2))}</blockquote>)
    } else if (line.trim()) {
      blocks.push(<p className="leading-6" key={index}>{renderInlineMarkdown(line)}</p>)
    } else {
      blocks.push(<div className="h-2" key={index} />)
    }
  }

  if (codeLines !== null) {
    blocks.push(<pre className="overflow-x-auto rounded-md bg-surface-1 p-3 font-mono text-xs" key="unterminated-code"><code>{codeLines.join("\n")}</code></pre>)
  }

  return <div className="max-h-[600px] space-y-2 overflow-auto rounded-lg border border-white/[0.06] bg-surface-2 p-5 text-sm text-foreground">{blocks}</div>
}

function sanitizeHtmlForPreview(html: string): string {
  const documentNode = new DOMParser().parseFromString(html, "text/html")
  documentNode.querySelectorAll("script, style, link, iframe, object, embed, img, video, audio, source, picture, meta, base, form").forEach((element) => element.remove())
  documentNode.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || ["style", "src", "srcset", "href", "action", "formaction", "poster", "background"].includes(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return documentNode.body.innerHTML
}

function downloadContent(content: string, format: ContentFormat) {
  const blob = new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = `firecrawl-parse-result.${format === "html" ? "html" : "md"}`
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export default function ParseResultViewer({ result, preferredFormat }: ParseResultViewerProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>("json")
  const data = responseData(result)
  const metadata = isRecord(data.metadata) ? data.metadata : null
  const preferred = preferredFormat === "html" ? "html" : "markdown"
  const fallback = preferred === "html" ? "markdown" : "html"
  const contentFormat: ContentFormat = typeof data[preferred] === "string" ? preferred : fallback
  const content = typeof data[contentFormat] === "string" ? data[contentFormat] : ""
  const tabs: Array<{ id: ResultTab; label: string }> = [
    { id: "json", label: "JSON" },
    { id: "metadata", label: "Metadata" },
    { id: "content", label: content ? (contentFormat === "html" ? "HTML" : "Markdown") : "Markdown / HTML" },
  ]

  return (
    <div>
      <div aria-label="Parse result sections" className="mb-3 flex flex-wrap items-center gap-1 border-b border-white/[0.06]" role="tablist">
        {tabs.map((tab) => (
          <Button
            aria-controls={`parse-result-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={cn("h-8 rounded-b-none border-b-2 px-3 text-xs", activeTab === tab.id ? "border-info-fg text-foreground" : "border-transparent text-muted-foreground")}
            id={`parse-result-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            size="sm"
            variant="ghost"
          >
            {tab.label}
          </Button>
        ))}
        {activeTab === "content" && content && (
          <Button className="mb-1 ml-auto h-7 px-2 text-xs" onClick={() => downloadContent(content, contentFormat)} size="sm" variant="ghost">
            <Download className="mr-1 size-3.5" /> Download {contentFormat === "html" ? "HTML" : "Markdown"}
          </Button>
        )}
      </div>

      <div aria-labelledby={`parse-result-tab-${activeTab}`} id={`parse-result-${activeTab}`} role="tabpanel">
        {activeTab === "json" && <JsonViewer value={result} />}
        {activeTab === "metadata" && (metadata ? <JsonViewer value={metadata} /> : <p className="rounded-lg bg-surface-1 p-4 text-sm text-muted-foreground">No metadata was returned.</p>)}
        {activeTab === "content" && !content && <p className="rounded-lg bg-surface-1 p-4 text-sm text-muted-foreground">No Markdown or HTML content was returned.</p>}
        {activeTab === "content" && contentFormat === "markdown" && content && <MarkdownViewer markdown={content} />}
        {activeTab === "content" && contentFormat === "html" && content && (
          <iframe
            className="min-h-[480px] w-full rounded-lg border border-white/[0.08] bg-white"
            sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:15px/1.6 system-ui,sans-serif;color:#171717;padding:24px;max-width:960px;margin:auto}pre{white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:6px}code{font-family:ui-monospace,monospace}table{border-collapse:collapse}td,th{border:1px solid #d4d4d8;padding:6px 10px}</style></head><body>${sanitizeHtmlForPreview(content)}</body></html>`}
            title="Parsed HTML preview"
          />
        )}
      </div>
    </div>
  )
}
