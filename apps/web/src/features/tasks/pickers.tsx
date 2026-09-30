import type { LabelVM, OptionVM, PersonVM } from "@app/protocol"
import {
  Avatar,
  Button,
  Dropdown,
  type DropdownOption,
  Field,
  Input,
  LabelChip,
  MultiDropdown,
  Swatch,
} from "@app/ui-kit"
import { sortIds } from "./draft.ts"
import styles from "./TaskForm.module.css"

/** Worker options → dropdown options with a colour swatch. */
export function swatchOptions<V extends string>(
  options: OptionVM<V>[],
  shape: "dot" | "flag" = "dot"
): DropdownOption<V>[] {
  return options.map((o) => ({
    value: o.value,
    label: o.label,
    media: o.color ? <Swatch color={o.color} shape={shape} /> : undefined,
  }))
}

type Layout = "horizontal" | "vertical"

export function OptionPicker<V extends string>(props: {
  label: string
  options: OptionVM<V>[]
  value: V
  onChange: (value: V) => void
  shape?: "dot" | "flag"
  hint?: string | undefined
  error?: string | undefined
  layout?: Layout
}) {
  return (
    <Field
      label={props.label}
      hint={props.hint}
      validationMessage={props.error}
      orientation={props.layout ?? "horizontal"}
      className={styles.property}
    >
      <Dropdown
        appearance="subtle"
        options={swatchOptions(props.options, props.shape)}
        value={props.value}
        onChange={props.onChange}
      />
    </Field>
  )
}

export function PeoplePicker(props: {
  label: string
  hint?: string | undefined
  people: PersonVM[]
  emptyText: string
  selected: string[]
  onChange: (ids: string[]) => void
  error?: string | undefined
  layout?: Layout
}) {
  const options = props.people.map((p) => ({
    value: p.id,
    label: p.name,
    media: <Avatar name={p.name} image={p.image ?? undefined} size={20} />,
  }))
  return (
    <Field
      label={props.label}
      hint={props.hint}
      validationMessage={props.error}
      orientation={props.layout ?? "horizontal"}
      className={styles.property}
    >
      <MultiDropdown
        appearance="subtle"
        options={options}
        value={props.selected}
        placeholder={props.people.length ? "Unassigned" : props.emptyText}
        disabled={props.people.length === 0}
        searchable={props.people.length > 5}
        emptyText="No one matches"
        onChange={(ids) => props.onChange(sortIds(ids))}
      />
    </Field>
  )
}

export function LabelPicker(props: {
  labels: LabelVM[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const byId = new Map(props.labels.map((l) => [l.id, l]))
  return (
    <Field label="Labels" orientation="horizontal" className={styles.property}>
      <MultiDropdown
        appearance="subtle"
        options={props.labels.map((l) => ({
          value: l.id,
          label: l.name,
          media: <Swatch color={l.color} />,
        }))}
        value={props.selected}
        placeholder={
          props.labels.length ? "None" : "No labels yet (add in Settings)"
        }
        disabled={props.labels.length === 0}
        onChange={(ids) => props.onChange(sortIds(ids))}
        renderValue={(ids) => (
          <span className={styles.chips}>
            {ids.map((id) => {
              const l = byId.get(id)
              return l ? (
                <LabelChip key={id} color={l.color} size="small">
                  {l.name}
                </LabelChip>
              ) : null
            })}
          </span>
        )}
      />
    </Field>
  )
}

/** A date input plus one-click presets (values come from the worker). */
export function DueField(props: {
  value: string
  onChange: (value: string) => void
  presets: OptionVM[]
  hint?: string | undefined
  error?: string | undefined
  layout?: Layout
}) {
  return (
    <Field
      label="Due"
      hint={props.hint ?? "Optional"}
      validationMessage={props.error}
      orientation={props.layout ?? "horizontal"}
      className={styles.property}
    >
      <div className={styles.due}>
        <Input
          type="date"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
        {/* A labelled set of toggle buttons. */}
        {/* biome-ignore lint/a11y/useSemanticElements: see above */}
        <div
          className={styles.presets}
          role="group"
          aria-label="Due date shortcuts"
        >
          {props.presets.map((p) => (
            <Button
              key={p.label}
              size="small"
              appearance={props.value === p.value ? "primary" : "secondary"}
              aria-pressed={props.value === p.value}
              onClick={() => props.onChange(p.value)}
            >
              {p.label}
            </Button>
          ))}
          {props.value && (
            <Button
              size="small"
              appearance="transparent"
              onClick={() => props.onChange("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </Field>
  )
}
