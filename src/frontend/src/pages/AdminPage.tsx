import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, Search, Shield, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Status } from "../backend";
import { useInternetIdentity } from "../hooks/useInternetIdentity";
import {
  useDeleteCase,
  useGetAlerts,
  useGetAllCases,
  useUpdateCaseStatus,
} from "../hooks/useQueries";

function statusBadge(status: Status) {
  switch (status) {
    case Status.active:
      return (
        <Badge className="bg-destructive/10 text-destructive border-destructive/20">
          Active
        </Badge>
      );
    case Status.underReview:
      return (
        <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-400/20">
          Under Review
        </Badge>
      );
    case Status.found:
      return (
        <Badge className="bg-green-500/10 text-green-700 border-green-400/20">
          Found
        </Badge>
      );
    case Status.closed:
      return <Badge className="bg-muted text-muted-foreground">Closed</Badge>;
    default:
      return <Badge>{String(status)}</Badge>;
  }
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { clear } = useInternetIdentity();
  const queryClient = useQueryClient();

  const { data: cases, isLoading: casesLoading } = useGetAllCases();
  const { data: alerts, isLoading: alertsLoading } = useGetAlerts();
  const updateStatus = useUpdateCaseStatus();
  const deleteCase = useDeleteCase();

  const [updatingContact, setUpdatingContact] = useState<string | null>(null);

  const handleStatusChange = async (contactNumber: string, status: Status) => {
    setUpdatingContact(contactNumber);
    try {
      await updateStatus.mutateAsync({ contactNumber, status });
    } finally {
      setUpdatingContact(null);
    }
  };

  const handleDelete = async (contactNumber: string) => {
    await deleteCase.mutateAsync(contactNumber);
  };

  const handleLogout = async () => {
    await clear();
    queryClient.clear();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Admin Navbar */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/admin"
              className="flex items-center gap-3"
              data-ocid="admin.link"
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-foreground leading-none">
                  Admin Panel
                </p>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  Missing Child Finder
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  data-ocid="admin.link"
                >
                  <Search className="w-4 h-4" />
                  User View
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
                data-ocid="admin.link"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Cases Management */}
        <section data-ocid="admin.panel">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-xl font-bold text-foreground mb-1">
              Case Management
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              Review, update status, and delete missing child cases.
            </p>

            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {casesLoading ? (
                <div className="p-6 space-y-3" data-ocid="admin.loading_state">
                  {["a", "b", "c", "d"].map((k) => (
                    <Skeleton key={k} className="h-10 w-full rounded" />
                  ))}
                </div>
              ) : !cases || cases.length === 0 ? (
                <div className="p-12 text-center" data-ocid="admin.empty_state">
                  <p className="text-muted-foreground">
                    No cases registered yet.
                  </p>
                </div>
              ) : (
                <Table data-ocid="admin.table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>Last Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((c, idx) => (
                      <TableRow
                        key={c.contactNumber}
                        data-ocid={`admin.item.${idx + 1}`}
                      >
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{Number(c.age)}</TableCell>
                        <TableCell className="max-w-[180px] truncate">
                          {c.lastLocation}
                        </TableCell>
                        <TableCell>{c.contactNumber}</TableCell>
                        <TableCell>
                          <Select
                            value={c.status}
                            onValueChange={(v) =>
                              handleStatusChange(c.contactNumber, v as Status)
                            }
                            disabled={updatingContact === c.contactNumber}
                          >
                            <SelectTrigger
                              className="w-36 h-8 text-xs"
                              data-ocid="admin.select"
                            >
                              <SelectValue>{statusBadge(c.status)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={Status.active}>
                                Active
                              </SelectItem>
                              <SelectItem value={Status.underReview}>
                                Under Review
                              </SelectItem>
                              <SelectItem value={Status.found}>
                                Found
                              </SelectItem>
                              <SelectItem value={Status.closed}>
                                Closed
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                data-ocid={`admin.delete_button.${idx + 1}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent data-ocid="admin.dialog">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Case</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the case for{" "}
                                  <strong>{c.name}</strong>? This action cannot
                                  be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-ocid="admin.cancel_button">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDelete(c.contactNumber)}
                                  data-ocid="admin.confirm_button"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </motion.div>
        </section>

        {/* Alerts Section */}
        <section data-ocid="admin.panel">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">
                Match Alerts
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Alerts generated when a face match was found during a search.
            </p>

            <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
              {alertsLoading ? (
                <div className="p-6 space-y-3" data-ocid="admin.loading_state">
                  {["a", "b", "c"].map((k) => (
                    <Skeleton key={k} className="h-10 w-full rounded" />
                  ))}
                </div>
              ) : !alerts || alerts.length === 0 ? (
                <div className="p-12 text-center" data-ocid="admin.empty_state">
                  <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No alerts have been sent yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.map((alert, idx) => (
                    <div
                      key={`${alert.contactNumber}-${idx}`}
                      className="flex items-start gap-4 p-4"
                      data-ocid={`admin.item.${idx + 1}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Bell className="w-4 h-4 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {alert.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Sent to: <strong>{alert.contactNumber}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          caffeine.ai
        </a>
      </footer>
    </div>
  );
}
