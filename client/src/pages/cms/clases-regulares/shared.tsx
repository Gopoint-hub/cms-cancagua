import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const clp = (value: number | string | null | undefined) =>
  `$${Math.round(Number(value ?? 0)).toLocaleString("es-CL")}`;

export const todayString = () => {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const currentMonthString = () => todayString().slice(0, 7);

export const monthLabel = (value: string | null | undefined) => {
  if (!value) return "—";
  const month = value.slice(0, 7);
  const label = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export function RegularClassesHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="mb-2">
          <Link href="/cms/clases-regulares">
            <Button variant="ghost" size="sm" className="-ml-3">
              <ArrowLeft className="mr-1 h-4 w-4" /> Clases regulares
            </Button>
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
