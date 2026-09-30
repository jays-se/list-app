import { tokenGroups, tokens } from "@app/ui-kit"
import styles from "./DesignGallery.module.css"

/** Static token catalogue (design metadata, not server data). */
export function TokenGallery() {
  return (
    <section className={styles.section} aria-labelledby="tokens">
      <h2 id="tokens" className={styles.heading}>
        Tokens
      </h2>

      <h3 className={styles.specimenTitle}>Colour (alias)</h3>
      <ul className={styles.swatches}>
        {tokenGroups.color.map((name) => (
          <li key={name} className={styles.swatch}>
            <span
              className={styles.chip}
              style={{ background: tokens[name] }}
              aria-hidden="true"
            />
            <code>{name}</code>
          </li>
        ))}
      </ul>

      <h3 className={styles.specimenTitle}>Type ramp</h3>
      <div className={styles.stack}>
        {tokenGroups.typography
          .filter((name) => name.startsWith("fontSize"))
          .map((name) => (
            <p
              key={name}
              className={styles.sample}
              style={{
                fontSize: tokens[name],
                lineHeight:
                  tokens[name.replace("fontSize", "lineHeight") as typeof name],
              }}
            >
              {name} — The quick brown fox
            </p>
          ))}
      </div>

      <h3 className={styles.specimenTitle}>Spacing (4px grid)</h3>
      <div className={styles.stack}>
        {tokenGroups.spacing.map((name) => (
          <div key={name} className={styles.spaceRow}>
            <code>{name}</code>
            <span className={styles.bar} style={{ width: tokens[name] }} />
          </div>
        ))}
      </div>

      <h3 className={styles.specimenTitle}>Radius · Elevation</h3>
      <div className={styles.row}>
        {tokenGroups.radius.map((name) => (
          <span
            key={name}
            className={styles.tile}
            style={{ borderRadius: tokens[name] }}
          >
            <code>{name.replace("borderRadius", "")}</code>
          </span>
        ))}
      </div>
      <div className={styles.row}>
        {tokenGroups.shadow.map((name) => (
          <span
            key={name}
            className={styles.tile}
            style={{ boxShadow: tokens[name] }}
          >
            <code>{name}</code>
          </span>
        ))}
      </div>
    </section>
  )
}
