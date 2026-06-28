import { useState, useEffect } from "react"
import { Search, LayoutGrid } from "lucide-react"
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
import { playgroundSearch, type SearchRequest } from "@/lib/playground"
import { useToast } from "@/hooks/useToast"

const RESULT_OPTIONS = ["5", "10", "20", "50"]

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState("default")
  const [lang, setLang] = useState("")
  const [country, setCountry] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Search the Web — Firecrawl Gateway"
  }, [])

  function buildBody(): SearchRequest {
    const body: SearchRequest = { query: query.trim() }
    if (limit && limit !== "default") body.limit = Number(limit)
    if (lang) body.lang = lang.trim()
    if (country) body.country = country.trim()
    return body
  }

  function getCode() {
    const body = buildBody()
    const code = `curl -X POST "${window.location.origin}/admin/api/playground/v1/search" \\
-H "Content-Type: application/json" \\
-d '${JSON.stringify(body, null, 2)}'`
    void navigator.clipboard.writeText(code)
    addToast("cURL copied to clipboard", "success")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!query.trim()) {
      addToast("Query is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    try {
      const json = await playgroundSearch(buildBody(), undefined, controller.signal)
      setResult(json)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  return (
    <PageLayout title="Search the Web" icon={Search}>
      <div className="space-y-4">
        <PlaygroundCard
          submitLabel="Start searching"
          submitLoadingLabel="Searching..."
          loading={loading}
          disabled={!query.trim()}
          onSubmit={handleSubmit}
          onGetCode={getCode}
          inputSection={
            <>
              <label htmlFor="search-query" className="sr-only">
                Search query
              </label>
              <input
                id="search-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Top restaurants in San Francisco"
                className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              />
            </>
          }
          toolbarExtras={
            <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-surface-1 px-2 py-1">
              <LayoutGrid className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Results:</span>
              <Select value={limit} onValueChange={(value) => setLimit(value)}>
                <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-xs font-medium text-foreground focus:ring-0">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  {RESULT_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          advanced={
            <>
              <div>
                <label htmlFor="search-lang" className="mb-1 block text-xs font-medium text-foreground">
                  Language
                </label>
                <input
                  id="search-lang"
                  type="text"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  placeholder="en"
                  className="h-9 w-full rounded-md border border-white/[0.08] bg-surface-1 px-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div>
                <label htmlFor="search-country" className="mb-1 block text-xs font-medium text-foreground">
                  Country
                </label>
                <input
                  id="search-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="US"
                  className="h-9 w-full rounded-md border border-white/[0.08] bg-surface-1 px-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </>
          }
        />
        <PlaygroundResult loading={loading} error={error} result={result} />
      </div>
    </PageLayout>
  )
}
