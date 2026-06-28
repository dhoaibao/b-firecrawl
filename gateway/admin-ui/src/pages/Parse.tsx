import { useState, useEffect, useRef } from "react"
import { FileText, Play, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import PageLayout from "@/components/PageLayout"
import PlaygroundResult from "@/components/PlaygroundResult"
import { playgroundParse, type ParseRequest } from "@/lib/playground"
import { DEFAULT_ROUTE_MODE, ROUTE_MODES, type RouteMode } from "@/lib/routing"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/useToast"

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
]

export default function ParsePage() {
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [formats, setFormats] = useState<string[]>(["markdown"])
  const [routeMode, setRouteMode] = useState<RouteMode>(DEFAULT_ROUTE_MODE)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Parse a File — Firecrawl Gateway"
  }, [])

  function toggleFormat(value: string) {
    setFormats((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    )
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setUrl("")
    }
  }

  function clearFile() {
    setFile(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file && !url.trim()) {
      addToast("URL or file is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    const params: ParseRequest = {}
    if (url.trim()) params.url = url.trim()
    if (formats.length > 0) params.formats = formats

    try {
      const json = await playgroundParse(file, params, routeMode, controller.signal)
      setResult(json)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "Parse failed")
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  return (
    <PageLayout title="Parse a File" icon={FileText}>
      <div className="space-y-4">
        <Card className="border-white/[0.06] bg-surface-2 shadow-none">
          <CardContent className="px-5 py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="parse-url" className="mb-1 block text-sm font-medium text-foreground">
                    URL
                  </label>
                  <input
                    id="parse-url"
                    type="url"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      if (e.target.value) setFile(null)
                    }}
                    placeholder="https://example.com/document.pdf"
                    disabled={Boolean(file)}
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">Or upload a file</label>
                  <div
                    className={`flex items-center justify-center rounded-lg border border-dashed px-4 py-6 transition-colors ${
                      file
                        ? "border-success-muted bg-success-muted/10"
                        : "border-white/[0.08] bg-surface-1 hover:border-white/12"
                    }`}
                  >
                    {file ? (
                      <div className="flex w-full items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="size-4 text-success-fg shrink-0" />
                          <span className="truncate text-sm text-foreground" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs shrink-0"
                          onClick={clearFile}
                        >
                          <X className="size-3.5 mr-1" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-2">
                        <Upload className="size-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Click to upload PDF, DOCX, or HTML</span>
                        <input
                          ref={inputRef}
                          type="file"
                          accept=".pdf,.docx,.doc,.html,.htm,.txt"
                          onChange={handleFileChange}
                          className="sr-only"
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-foreground">Formats</label>
                  <div className="flex flex-wrap gap-2">
                    {FORMAT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={formats.includes(option.value)}
                        onClick={() => toggleFormat(option.value)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                          formats.includes(option.value)
                            ? "border-ring bg-ring/20 text-foreground"
                            : "border-white/[0.08] bg-surface-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="parse-route-mode" className="mb-1 block text-sm font-medium text-foreground">
                    Route Mode
                  </label>
                  <Select value={routeMode} onValueChange={(value) => setRouteMode(value as RouteMode)}>
                    <SelectTrigger id="parse-route-mode" className="h-10 w-full text-sm">
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
              </div>
              <div className="flex items-center justify-end">
                <Button type="submit" disabled={loading || (!url.trim() && !file)}>
                  <Play className="size-4 mr-1" />
                  {loading ? "Parsing..." : "Run Parse"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <PlaygroundResult loading={loading} error={error} result={result} />
      </div>
    </PageLayout>
  )
}
