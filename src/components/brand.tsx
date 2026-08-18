import Image from "next/image";

/**
 * Brand furniture. The full artwork is used where it has room to breathe
 * (sign-in, the external reviewer's header); everywhere else the mark is paired
 * with a typeset wordmark so it stays crisp at small sizes.
 */

export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      width={size}
      height={size}
      priority
      className={`shrink-0 select-none ${className}`}
    />
  );
}

export function LogoLockup({
  width = 320,
  className = "",
}: {
  width?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Who Gives A Shift"
      width={width}
      height={Math.round((width * 483) / 1060)}
      priority
      className={`select-none ${className}`}
    />
  );
}

/** Typeset wordmark: blue "WHO GIVES A", yellow-dot A, coral "SHIFT". */
export function Wordmark({ size = "sm" }: { size?: "sm" | "md" }) {
  const md = size === "md";
  return (
    <span
      role="img"
      aria-label="Who Gives A Shift"
      className={`display inline-flex items-center gap-1.5 font-semibold uppercase leading-none tracking-tight ${
        md ? "text-lg" : "text-sm"
      }`}
    >
      <span className="text-brand-blue">Who Gives</span>
      {/* The yellow chip always carries the logo's blue letter, in either theme. */}
      <span
        className={`grid shrink-0 place-items-center rounded-full bg-brand-yellow font-bold text-[#0049b9] ${
          md ? "size-7 text-base" : "size-[1.4em] text-[0.8em]"
        }`}
      >
        A
      </span>
      <span className="text-brand-coral">Shift</span>
    </span>
  );
}

/** Mark + wordmark, the standard app lockup. */
export function BrandLockup({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size === "md" ? 40 : 30} />
      <Wordmark size={size} />
    </span>
  );
}
