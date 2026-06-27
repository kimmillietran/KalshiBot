import { surfaces, textCaption } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type UnavailableMetricProps = {
  message: string;
};

export function UnavailableMetric({ message }: UnavailableMetricProps) {
  return (
    <div className={cn(surfaces.dashedEmpty, "px-4 py-4 text-center")}>
      <p className={cn(textCaption, "leading-relaxed")}>{message}</p>
    </div>
  );
}
