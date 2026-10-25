// Ruled writing space for printed notes panes. Each rule is a real bottom
// border rather than a background gradient: Firefox prints hard-stop gradients
// as PDF shadings that printers (and low-resolution rasterizers) drop in some
// regions, and backgrounds also vanish when "Print backgrounds" is off.
// Enough rules for a full page; the container clips the surplus.
const WRITING_LINE_COUNT = 44;

export function WritingLines({ className = "" }: { className?: string }) {
  return (
    <div className={`sp-writing-lines ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: WRITING_LINE_COUNT }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}
