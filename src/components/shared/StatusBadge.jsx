import { cn } from "@/lib/utils";

const styles = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  entered: "bg-blue-100 text-blue-700 border-blue-200",
  exited: "bg-slate-100 text-slate-700 border-slate-200",
};

const labels = {
  pending: "Waiting for Approval",
  approved: "Access Granted",
  rejected: "Access Denied",
  entered: "Currently Inside",
  exited: "Checked Out",
};

export function StatusBadge({ status, className }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      styles[status] || styles.pending,
      className
    )}>
      {labels[status]}
    </span>
  );
}
