import { useState, useEffect } from "react"
import { Globe, FileText } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PageLayout from "@/components/PageLayout"
import PlaygroundCard from "@/components/PlaygroundCard"
import PlaygroundResult from "@/components/PlaygroundResult"
import { playgroundScrape, type ScrapeRequest } from "@/lib/playground"
import { DEFAULT_ROUTE_MODE, ROUTE_MODES, type RouteMode } from "@/lib/routing"
import { useToast } from "@/hooks/useToast"

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "rawHtml", label: "Raw HTML" },
  { value: "links", label: "Links" },
  { value: "screenshot", label: "Screenshot (Cloud)" },
]

export default function ScrapePage() {
  const [url, setUrl] = useState("")
  const [format, setFormat] = useState("markdown")
  const [onlyMainContent, setOnlyMainContent] = useState(true)
  const [waitFor, setWaitFor] = useState("")
  const [routeMode, setRouteMode] = useState<RouteMode>(DEFAULT_ROUTE_MODE)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Scrape a Web Page — Firecrawl Gateway"
  }, [])

  function buildBody(): ScrapeRequest {
    const body: ScrapeRequest = { url: url.trim() }
    body.formats = [format]
    if (!onlyMainContent) body.onlyMainContent = false
    if (waitFor) body.waitFor = Number(waitFor)
    return body
  }

  function getCode() {
    const body = buildBody()
    const headers = [
      '-H "Content-Type: application/json"',
      routeMode ? ` -H "X-Firecrawl-Route-Mode: ${routeMode}"` : "",
    ].join(" ")
    const code = `curl -X POST "${window.location.origin}/admin/api/playground/v1/scrape" \\
${headers} \\
-d '${JSON.stringify(body, null, 2)}'`
    void navigator.clipboard.writeText(code)
    addToast("cURL copied to clipboard", "success")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!url.trim()) {
      addToast("URL is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    try {
      const json = await playgroundScrape(buildBody(), routeMode, controller.signal)
      setResult(json)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "Scrape failed")
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  return (
    <PageLayout title="Scrape a Web Page" icon={Globe}>
      <div className="space-y-4">
        <PlaygroundCard
          submitLabel="Start scraping"
          submitLoadingLabel="Scraping..."
          loading={loading}
          disabled={!url.trim()}
          onSubmit={handleSubmit}
          onGetCode={getCode}
          inputSection={
            <>
              <label htmlFor="scrape-url" className="sr-only">
                URL
              </label>
              <div className="flex items-center gap-2">
                <span className="select-none font-mono text-sm text-muted-foreground">
                  https://
                </span>
                <input
                  id="scrape-url"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com"
                  className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </>
          }
          toolbarExtras={
            <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-surface-1 px-2 py-1">
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Format:</span>
              <Select value={format} onValueChange={(value) => setFormat(value)}>
                <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-xs font-medium text-foreground focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          advanced={
            <>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id="scrape-main-content"
                  type="checkbox"
                  checked={onlyMainContent}
                  onChange={(e) => setOnlyMainContent(e.target.checked)}
                  className="size-4 rounded border-white/[0.08] bg-surface-1 text-brand focus:ring-brand/30"
                />
                <label htmlFor="scrape-main-content" className="text-sm text-foreground">
                  Only main content
                </label>
              </div>
              <div>
                <label htmlFor="scrape-wait" className="mb-1 block text-xs font-medium text-foreground">
                  Wait For (ms)
                </label>
                <input
                  id="scrape-wait"
                  type="number"
                  min={0}
                  value={waitFor}
                  onChange={(e) => setWaitFor(e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-md border border-white/[0.08] bg-surface-1 px-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div>
                <label htmlFor="scrape-route-mode" className="mb-1 block text-xs font-medium text-foreground">
                  Route Mode
                </label>
                <Select value={routeMode} onValueChange={(value) => setRouteMode(value as RouteMode)}>
                  <SelectTrigger id="scrape-route-mode" className="h-9 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          }
        />
        <PlaygroundResult loading={loading} error={error} result={result} />
      </div>
    </PageLayout>
  )
}
