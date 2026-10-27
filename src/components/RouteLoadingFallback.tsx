export function RouteLoadingFallback({ message = 'Loading workspace...' }: { message?: string }) {
  return (
    <div className="flex min-h-[80vh] w-full flex-col items-center justify-center p-6 text-center select-none">
      <div className="relative mb-6 flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <div className="absolute h-2 w-2 rounded-full bg-primary" />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold tracking-wide text-foreground uppercase font-mono">
          {message}
        </p>
        <p className="text-xs text-muted-foreground/80 font-mono">
          Initializing local environment &amp; trading telemetry
        </p>
      </div>
    </div>
  );
}
