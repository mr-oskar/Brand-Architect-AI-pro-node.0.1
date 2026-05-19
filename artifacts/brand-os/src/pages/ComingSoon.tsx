import { Link } from "wouter";
import { ArrowLeft, Construction } from "lucide-react";

interface ComingSoonProps {
  title?: string;
}

export default function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Construction className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-2">
        {title ?? "Coming Soon"}
      </h1>
      <p className="text-sm text-muted-foreground max-w-xs mb-8">
        This feature is currently under development and will be available in a future update.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}
