import type {
  ClientDraft,
  LabelColorKey,
  OptionVM,
  ProtocolError,
} from "@app/protocol"
import { Dropdown, Field, Input, Swatch, Textarea } from "@app/ui-kit"
import styles from "./Clients.module.css"

const fieldError = (e: ProtocolError | undefined, f: string) =>
  e?.fieldErrors?.find((x) => x.field === f)?.message

export function ClientForm(props: {
  draft: ClientDraft
  onChange: (d: ClientDraft) => void
  colorOptions: OptionVM<LabelColorKey>[]
  error: ProtocolError | undefined
}) {
  const { draft, onChange, colorOptions, error } = props
  const set = <K extends keyof ClientDraft>(k: K, v: ClientDraft[K]) =>
    onChange({ ...draft, [k]: v })
  return (
    <div className={styles.form}>
      <Field
        label="Name"
        validationMessage={fieldError(error, "name")}
        required
      >
        <Input
          value={draft.name}
          maxLength={100}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className={styles.row}>
        <Field label="Email" validationMessage={fieldError(error, "email")}>
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Phone" validationMessage={fieldError(error, "phone")}>
          <Input
            value={draft.phone}
            maxLength={40}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Color">
          <Dropdown
            value={draft.color}
            options={colorOptions.map((o) => ({
              ...o,
              media: <Swatch color={o.value} />,
            }))}
            onChange={(v) => set("color", v as LabelColorKey)}
          />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          rows={3}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      {error && !error.fieldErrors?.length && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
    </div>
  )
}
