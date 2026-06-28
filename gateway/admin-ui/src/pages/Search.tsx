import { useState, useEffect } from "react"
import { Search, Play } from "lucide-react"
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
import { playgroundSearch, type SearchRequest } from "@/lib/playground"
import { DEFAULT_ROUTE_MODE, ROUTE_MODES, type RouteMode } from "@/lib/routing"
import { useToast } from "@/hooks/useToast"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState("")
  const [lang, setLang] = useState("")
  const [country, setCountry] = useState("")
  const [routeMode, setRouteMode] = useState<RouteMode>(DEFAULT_ROUTE_MODE)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(undefined)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  useEffect(() => {
    document.title = "Search the Web — Firecrawl Gateway"
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) {
      addToast("Query is required", "error")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(undefined)

    const body: SearchRequest = { query: query.trim() }
    if (limit) body.limit = Number(limit)
    if (lang) body.lang = lang.trim()
    if (country) body.country = country.trim()

    try {
      const json = await playgroundSearch(body, routeMode, controller.signal)
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
        <Card className="border-white/[0.06] bg-surface-2 shadow-none">
          <CardContent className="px-5 py-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="search-query" className="mb-1 block text-sm font-medium text-foreground">
                    Query
                  </label>
                  <input
                    id="search-query"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter search query..."
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label htmlFor="search-limit" className="mb-1 block text-sm font-medium text-foreground">
                    Limit
                  </label>
                  <input
                    id="search-limit"
                    type="number"
                    min={1}
                    max={50}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="5"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label htmlFor="search-lang" className="mb-1 block text-sm font-medium text-foreground">
                    Language
                  </label>
                  <input
                    id="search-lang"
                    type="text"
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    placeholder="en"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label htmlFor="search-country" className="mb-1 block text-sm font-medium text-foreground">
                    Country
                  </label>
                  <input
                    id="search-country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="US"
                    className="h-10 w-full rounded-lg border border-white/[0.08] bg-surface-3 px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground hover:border-white/12 focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                </div>
                <div>
                  <label htmlFor="search-route-mode" className="mb-1 block text-sm font-medium text-foreground">
                    Route Mode
                  </label>
                  <Select value={routeMode} onValueChange={(value) => setRouteMode(value as RouteMode)}>
                    <SelectTrigger id="search-route-mode" className="h-10 w-full text-sm">
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
                <Button type="submit" disabled={loading || !query.trim()}>
                  <Play className="size-4 mr-1" />
                  {loading ? "Searching..." : "Run Search"}
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
