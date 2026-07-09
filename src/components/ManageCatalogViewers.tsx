import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiActivateCatalogViewer,
  apiCreateCatalogViewer,
  apiListCatalogViewers,
  apiRevokeCatalogViewer,
  type CatalogViewerRecord,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Loader2, Plus, Users } from "lucide-react";

export default function ManageCatalogViewers() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<CatalogViewerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiListCatalogViewers(token);
      setUsers(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  const resetCreateForm = () => {
    setNewUsername("");
    setNewPassword("");
  };

  const handleCreateUser = async () => {
    if (!token) return;
    const username = newUsername.trim();
    const password = newPassword.trim();
    if (!username || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter both username and password.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      await apiCreateCatalogViewer(token, username, password);
      toast({ title: "Success", description: "Catalog viewer user created." });
      setCreateOpen(false);
      resetCreateForm();
      await fetchUsers();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast({ title: "Create Failed", description: message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAccess = async (user: CatalogViewerRecord) => {
    if (!token) return;
    setUpdatingUid(user.uid);
    try {
      if (user.active) {
        await apiRevokeCatalogViewer(token, user.uid);
        toast({ title: "Access revoked", description: `${user.username} can no longer access the catalog viewer.` });
      } else {
        await apiActivateCatalogViewer(token, user.uid);
        toast({ title: "Access activated", description: `${user.username} can now access the catalog viewer.` });
      }

      setUsers((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, active: !u.active } : u))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update access";
      toast({ title: "Update Failed", description: message, variant: "destructive" });
    } finally {
      setUpdatingUid(null);
    }
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard on this browser.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Catalog Viewer Management</h2>
          <p className="text-sm text-muted-foreground">Create users and control access to the catalog viewer.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="mb-4 h-16 w-16 text-muted-foreground/40" />
          <p className="text-muted-foreground">No catalog viewer users yet.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((user) => (
                <TableRow key={user.uid}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.username}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => copyToClipboard(user.username, "Username")}
                        title="Copy username"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-xs tracking-widest"
                        aria-label={`Hidden password for ${user.username}`}
                      >
                        {"•".repeat(Math.max(user.password.length, 8))}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => copyToClipboard(user.password, "Password")}
                        title="Copy password"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.active ? "default" : "secondary"}>
                      {user.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={user.active ? "destructive" : "default"}
                      disabled={updatingUid === user.uid}
                      onClick={() => handleToggleAccess(user)}
                    >
                      {updatingUid === user.uid ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : user.active ? (
                        "Revoke Access"
                      ) : (
                        "Activate Access"
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && !creating) {
            resetCreateForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Catalog Viewer User</DialogTitle>
            <DialogDescription>
              Enter username and password for the new catalog viewer account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-viewer-username">Username</Label>
              <Input
                id="catalog-viewer-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter username"
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-viewer-password">Password</Label>
              <Input
                id="catalog-viewer-password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password"
                disabled={creating}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={creating} onClick={handleCreateUser}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
