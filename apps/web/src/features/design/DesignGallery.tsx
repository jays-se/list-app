import { ComponentGallery } from "./ComponentGallery.tsx"
import styles from "./DesignGallery.module.css"
import { TokenGallery } from "./TokenGallery.tsx"

/** Dev-only living reference for @app/ui-kit (E0-S5). */
export function DesignGallery() {
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Design system</h1>
        <p className={styles.lead}>
          Tokens and primitives from <code>@app/ui-kit</code>, following Fluent
          2 principles (ADR-0014). Switch the theme in the header to check
          light, dark and high contrast.
        </p>
      </header>
      <ComponentGallery />
      <TokenGallery />
    </div>
  )
}
