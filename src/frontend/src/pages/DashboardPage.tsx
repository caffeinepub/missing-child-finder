import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import Navbar from "../components/Navbar";
import {
  Status,
  useGetAllCases,
  useGetDashboardStats,
} from "../hooks/useQueries";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: cases, isLoading: casesLoading } = useGetAllCases();
  const [search, setSearch] = useState("");

  const filteredCases = (cases ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.lastLocation.toLowerCase().includes(search.toLowerCase()) ||
      c.contactNumber.includes(search),
  );

  const kpiCards = [
    {
      label: "Total Cases",
      value: stats ? Number(stats.totalCases) : "-",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Active Cases",
      value: stats ? Number(stats.activeCases) : "-",
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "Found / Resolved",
      value: stats ? Number(stats.foundCases) : "-",
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Pending Matches",
      value: stats ? Math.max(0, Number(stats.activeCases)) : "-",
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      {/* Hero strip */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                Active Case Dashboard
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Monitor and manage missing child cases in real time
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-ocid="dashboard.search_input"
                placeholder="Quick search cases..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome + CTA */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-foreground font-semibold text-lg">Welcome Back</p>
          <Button
            data-ocid="dashboard.primary_button"
            onClick={() => navigate({ to: "/register" })}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Child Case
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpiCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-card rounded-xl border border-border shadow-card p-5"
              data-ocid="dashboard.card"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {card.label}
                </span>
                <div
                  className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}
                >
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              {statsLoading ? (
                <Skeleton
                  className="h-8 w-16"
                  data-ocid="dashboard.loading_state"
                />
              ) : (
                <p className={`text-3xl font-bold ${card.color}`}>
                  {card.value}
                </p>
              )}
            </motion.div>
          ))}
        </div>

        {/* Cases Table */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Recently Registered Children
            </h2>
            <Badge variant="secondary">{filteredCases.length} cases</Badge>
          </div>

          {casesLoading ? (
            <div className="p-6 space-y-3" data-ocid="dashboard.loading_state">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredCases.length === 0 ? (
            <div
              className="py-16 text-center"
              data-ocid="dashboard.empty_state"
            >
              <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                {search
                  ? "No matching cases found."
                  : "No cases registered yet."}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate({ to: "/register" })}
                  data-ocid="dashboard.secondary_button"
                >
                  Register First Case
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Child
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Age
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                      Last Location
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                      Last Seen Place
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Status
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((c, idx) => (
                    <tr
                      key={c.contactNumber}
                      className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      data-ocid={`dashboard.item.${idx + 1}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                            {c.photoId ? (
                              <img
                                src={c.photoId}
                                alt={c.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ) : (
                              <span className="text-primary font-bold text-sm">
                                {c.name.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {c.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {c.contactNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {Number(c.age)} yrs
                      </td>
                      <td className="px-4 py-4 text-muted-foreground hidden md:table-cell max-w-[140px] truncate">
                        {c.lastLocation}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground hidden lg:table-cell max-w-[140px] truncate">
                        {c.lastSeenPlace}
                      </td>
                      <td className="px-4 py-4">
                        {c.status === Status.active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            Found
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate({ to: "/search" })}
                          data-ocid="dashboard.edit_button"
                          className="gap-1 text-xs"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-footer text-footer-foreground mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-sm text-center">
            &copy; {new Date().getFullYear()} Active Child Finder. Built with
            love using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              caffeine.ai
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
