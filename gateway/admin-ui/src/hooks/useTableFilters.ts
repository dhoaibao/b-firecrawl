import { useState, useMemo, useEffect } from "react"

export interface FilterState<T> {
  searchQuery: string
  setSearchQuery: (value: string) => void

  page: number
  setPage: (value: number) => void

  pageSize: number
  setPageSize: (value: number) => void

  filteredData: T[]
  paginatedData: T[]

  totalPages: number
  totalItems: number

  resetFilters: () => void
}

interface UseTableFiltersOptions<T> {
  data: T[]
  pageSize?: number
  searchFields?: Array<keyof T>
  filterFn?: (item: T) => boolean
}

export function useTableFilters<T>({
  data,
  pageSize: initialPageSize = 10,
  searchFields,
  filterFn,
}: UseTableFiltersOptions<T>): FilterState<T> {
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, filterFn])

  const filteredData = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return data.filter((item) => {
      // Search filter
      if (normalizedSearch && searchFields && searchFields.length > 0) {
        const matches = searchFields.some((field) => {
          const value = item[field]
          if (typeof value === "string") {
            return value.toLowerCase().includes(normalizedSearch)
          }
          return false
        })
        if (!matches) return false
      }

      // Custom filter
      if (filterFn && !filterFn(item)) {
        return false
      }

      return true
    })
  }, [data, searchQuery, searchFields, filterFn])

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize)

  const resetFilters = () => {
    setSearchQuery("")
    setPage(1)
  }

  return {
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    setPageSize,
    filteredData,
    paginatedData,
    totalPages,
    totalItems: filteredData.length,
    resetFilters,
  }
}
