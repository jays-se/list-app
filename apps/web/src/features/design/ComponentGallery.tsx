import {
  AddIcon,
  Avatar,
  Badge,
  type BadgeColor,
  Button,
  type ButtonAppearance,
  Checkbox,
  ConfirmDialog,
  DismissIcon,
  Drawer,
  Field,
  IconButton,
  Input,
  LabelChip,
  paletteKeys,
  Spinner,
  Textarea,
} from "@app/ui-kit"
import { type ReactNode, useState } from "react"
import styles from "./DesignGallery.module.css"

const APPEARANCES: ButtonAppearance[] = [
  "primary",
  "secondary",
  "subtle",
  "transparent",
]
const BADGE_COLORS: BadgeColor[] = [
  "brand",
  "danger",
  "warning",
  "success",
  "informative",
  "subtle",
]

export function ComponentGallery() {
  const [drawer, setDrawer] = useState(false) // gallery demo state
  const [dialog, setDialog] = useState(false)
  return (
    <section className={styles.section} aria-labelledby="components">
      <h2 id="components" className={styles.heading}>
        Components
      </h2>

      <Specimen title="Button">
        <div className={styles.row}>
          {APPEARANCES.map((a) => (
            <Button key={a} appearance={a}>
              {a}
            </Button>
          ))}
          <Button disabled>disabled</Button>
        </div>
        <div className={styles.row}>
          <Button size="small">Small</Button>
          <Button size="medium">Medium</Button>
          <Button size="large">Large</Button>
          <Button appearance="primary" icon={<AddIcon />}>
            New task
          </Button>
          <Button shape="circular">Circular</Button>
          <IconButton
            icon={<DismissIcon />}
            aria-label="Close"
            appearance="subtle"
          />
        </div>
      </Specimen>

      <Specimen title="Field · Input · Textarea">
        <div className={styles.grid2}>
          <Field label="Title" hint="Short and specific" required>
            <Input placeholder="Write release notes" />
          </Field>
          <Field
            label="Due date"
            validationMessage="End date must be on or after start date"
          >
            <Input type="date" />
          </Field>
          <Field label="Filled input">
            <Input appearance="filled" placeholder="Search" />
          </Field>
          <Field label="Disabled">
            <Input disabled value="Read only" />
          </Field>
          <Field label="Notes" hint="Markdown supported later (ADR-0011)">
            <Textarea rows={3} />
          </Field>
        </div>
      </Specimen>

      <Specimen title="Checkbox">
        <div className={styles.row}>
          <Checkbox label="Unchecked" />
          <Checkbox label="Checked" defaultChecked />
          <Checkbox label="Disabled" disabled />
          <Checkbox label="Disabled checked" disabled defaultChecked />
        </div>
      </Specimen>

      <Specimen title="Badge">
        {(["tint", "filled", "outline"] as const).map((appearance) => (
          <div key={appearance} className={styles.row}>
            {BADGE_COLORS.map((c) => (
              <Badge key={c} appearance={appearance} color={c}>
                {c}
              </Badge>
            ))}
          </div>
        ))}
      </Specimen>

      <Specimen title="LabelChip">
        <div className={styles.row}>
          {paletteKeys.map((k) => (
            <LabelChip key={k} color={k}>
              {k}
            </LabelChip>
          ))}
        </div>
      </Specimen>

      <Specimen title="Drawer · ConfirmDialog">
        <div className={styles.row}>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button onClick={() => setDialog(true)}>Open confirm dialog</Button>
        </div>
        <Drawer
          open={drawer}
          title="Drawer title"
          subtitle="Subtitle"
          onRequestClose={() => setDrawer(false)}
          footer={
            <Button appearance="primary" onClick={() => setDrawer(false)}>
              Done
            </Button>
          }
        >
          <Field label="Example field">
            <Input />
          </Field>
        </Drawer>
        <ConfirmDialog
          open={dialog}
          title="Delete this task?"
          confirmLabel="Delete"
          onConfirm={() => setDialog(false)}
          onCancel={() => setDialog(false)}
        >
          This can't be undone.
        </ConfirmDialog>
      </Specimen>

      <Specimen title="Avatar · Spinner">
        <div className={styles.row}>
          <Avatar name="Ada Lovelace" size={24} />
          <Avatar name="Grace Hopper" size={32} />
          <Avatar name="Alan Turing" size={40} />
          <Avatar name="Katherine Johnson" size={48} />
          <Spinner size="tiny" />
          <Spinner size="small" />
          <Spinner size="medium" label="Loading tasks" />
        </div>
      </Specimen>
    </section>
  )
}

function Specimen(props: { title: string; children: ReactNode }) {
  return (
    <div className={styles.specimen}>
      <h3 className={styles.specimenTitle}>{props.title}</h3>
      {props.children}
    </div>
  )
}
