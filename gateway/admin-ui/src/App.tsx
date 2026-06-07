import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import Dashboard from "@/pages/Dashboard"
import Login from "@/pages/Login"
import Users from "@/pages/Users"
import ApiKeys from "@/pages/ApiKeys"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }
  if (!user?.is_admin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAdmin>
              <Users />
            </RequireAdmin>
          }
        />
        <Route
          path="/api-keys"
          element={
            <RequireAuth>
              <ApiKeys />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
