import { useState, useEffect, useRef } from "react"
import { FileText, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import ParseResultViewer from "@/components/ParseResultViewer"
import { playgroundParse, type ParseRequest } from "@/lib/playground"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/useToast"

const FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "html", label: "HTML" },
]

export default function ParsePage() {
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState("markdown")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Parse a File — Firecrawl Gateway"
  }, [])

  function handleFileChange(selected: File | null) {
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

  function buildParams(): ParseRequest {
    const params: ParseRequest = {}
    if (url.trim()) params.url = url.trim()
    params.formats = [format]
    return params
  }

  function getCode() {
    const params = buildParams()

    let code: string
    if (file) {
      code = `const formData = new FormData()
formData.append("file", file)
formData.append("options", '${JSON.stringify({ formats: params.formats })}')
await fetch("${window.location.origin}/admin/api/playground/v2/parse", {
  method: "POST",
  body: formData,
})`
    } else {
      code = `await fetch("${window.location.origin}/admin/api/playground/v2/scrape", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${JSON.stringify(params, null, 2)}),
})`
    }

    void navigator.clipboard.writeText(code)
    addToast("Code snippet copied to clipboard", "success")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file && !url.trim()) {
      addToast("URL or file is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    try {
      const json = await playgroundParse(file, buildParams(), undefined, controller.signal)
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
        <PlaygroundCard
          submitLabel="Start parsing"
          submitLoadingLabel="Parsing..."
          loading={loading}
          disabled={(!url.trim() && !file)}
          onSubmit={handleSubmit}
          onGetCode={getCode}
          inputSection={
            <>
              <label htmlFor="parse-file" className="sr-only">
                Upload file
              </label>
              <label
                htmlFor="parse-file"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFileChange(e.dataTransfer.files?.[0] ?? null)
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-5 py-5 transition-colors",
                  file
                    ? "border-success-muted bg-success-muted/10"
                    : "border-white/[0.08] bg-surface-1 hover:border-white/12",
                )}
              >
                {file ? (
                  <>
                    <span className="rounded-md border border-white/[0.12] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                      File
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
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
                      className="h-7 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault()
                        clearFile()
                      }}
                    >
                      <X className="size-3.5 mr-1" /> Remove
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="rounded-md border border-white/[0.12] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground">
                      File
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Drop a file or click to upload — PDF, DOCX, XLSX, HTML
                    </span>
                    <Upload className="ml-auto size-4 text-muted-foreground" />
                  </>
                )}
                <input
                  ref={inputRef}
                  id="parse-file"
                  type="file"
                  accept=".pdf,.docx,.doc,.odt,.rtf,.xlsx,.xls,.html,.htm"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
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
              <div className="md:col-span-2">
                <label htmlFor="parse-url" className="mb-1 block text-xs font-medium text-foreground">
                  Or parse a public document URL
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
                  className="h-9 w-full rounded-md border border-white/[0.08] bg-surface-1 px-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
                />
              </div>
            </>
          }
        />
        <PlaygroundResult loading={loading} error={error} result={result}>
          {result !== undefined ? <ParseResultViewer preferredFormat={format} result={result} /> : undefined}
        </PlaygroundResult>
      </div>
    </PageLayout>
  )
}
