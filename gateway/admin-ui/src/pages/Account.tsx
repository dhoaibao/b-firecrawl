import { useEffect, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import PageLayout from "@/components/PageLayout"
import { useToast } from "@/hooks/useToast"
import { api } from "@/lib/api"

export default function Account() {
  const { addToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = "Account — Firecrawl Gateway" }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      addToast("New passwords do not match", "error")
      return
    }

    setSaving(true)
    try {
      await api.post("/admin/api/auth/password", {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      addToast("Password changed successfully", "success")
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to change password", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageLayout title="Account" icon={KeyRound}>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Update the password used to sign in to the admin dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-foreground">
              Current password
              <input
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              New password
              <input
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Confirm new password
              <input
                className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageLayout>
  )
}
