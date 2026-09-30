import type { SVGProps } from "react"

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: 16 | 20 | 24
  /** Accessible name. Omit for decorative icons (hidden from AT). */
  title?: string
}

/** In-house icon factory: 20px grid paths, `currentColor` fill. */
export function createIcon(name: string, path: string) {
  function Icon({ size = 20, title, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="currentColor"
        focusable="false"
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        {...rest}
      >
        <path d={path} />
      </svg>
    )
  }
  Icon.displayName = name
  return Icon
}
