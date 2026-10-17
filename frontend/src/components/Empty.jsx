export default function Empty({ icon: Icon, title, desc, children }) {
  return (
    <div className="animate-fade-up flex flex-col items-center gap-3 border border-dashed border-border bg-card/50 px-4 py-16 text-center">
      {Icon && (
        <span className="flex size-14 items-center justify-center bg-secondary text-muted-foreground shadow-panel clip-tactical">
          <Icon className="size-7" />
        </span>
      )}
      <p className="font-heading text-lg font-bold text-foreground">{title}</p>
      {desc && <p className="max-w-xs text-sm text-muted-foreground">{desc}</p>}
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
