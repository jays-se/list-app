import { createLineIcon } from "./create-icon.tsx"

/** A circle as path data, so line icons stay a single <path>. */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

export const NavigationIcon = createLineIcon(
  "NavigationIcon",
  "M3 5.5h14M3 10h14M3 14.5h14"
)
export const HomeIcon = createLineIcon(
  "HomeIcon",
  "M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1H12v-5H8v5H4.5a1 1 0 0 1-1-1Z"
)
export const TaskListIcon = createLineIcon(
  "TaskListIcon",
  "M3.5 5.5 5 7l2.5-2.5M3.5 12 5 13.5 7.5 11M10 6h6.5M10 12.5h6.5"
)
export const CalendarIcon = createLineIcon(
  "CalendarIcon",
  "M4 4.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1ZM3 8.5h14M7 2.5v4M13 2.5v4"
)
export const FlashIcon = createLineIcon(
  "FlashIcon",
  "M11 2.5 4.5 11h5l-1 6.5L15.5 9h-5Z"
)
export const DocumentIcon = createLineIcon(
  "DocumentIcon",
  "M5.5 2.5h6L15 6v10.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM11.5 2.5V6H15M7.5 10h5M7.5 13h5"
)
export const BuildingIcon = createLineIcon(
  "BuildingIcon",
  "M4 17.5v-13a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v13M12 8h3a1 1 0 0 1 1 1v8.5M2.5 17.5h15M7 6.5h2M7 9.5h2M7 12.5h2"
)
export const InboxIcon = createLineIcon(
  "InboxIcon",
  "M3 11.5 5 4.5h10l2 7V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM3 11.5h4l1 2h4l1-2h4"
)
export const SettingsIcon = createLineIcon(
  "SettingsIcon",
  `M3 6h7M14 6h3M3 14h3M10 14h7${circle(12, 6, 2)}${circle(8, 14, 2)}`
)
export const SearchIcon = createLineIcon(
  "SearchIcon",
  `${circle(8.5, 8.5, 5.5)}M12.5 12.5 17 17`
)
export const AppsIcon = createLineIcon(
  "AppsIcon",
  "M3.5 3.5h5v5h-5ZM11.5 3.5h5v5h-5ZM3.5 11.5h5v5h-5ZM11.5 11.5h5v5h-5Z"
)
export const SignOutIcon = createLineIcon(
  "SignOutIcon",
  "M8 3.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3M12 6.5l3.5 3.5-3.5 3.5M15.5 10H8"
)
export const PersonIcon = createLineIcon(
  "PersonIcon",
  `${circle(10, 6, 3)}M4 17c.5-3.3 3-5 6-5s5.5 1.7 6 5`
)
export const PersonAddIcon = createLineIcon(
  "PersonAddIcon",
  `${circle(8, 6, 3)}M2.5 17c.5-3.3 2.7-5 5.5-5 1.2 0 2.3.3 3.2.9M15 11v6M12 14h6`
)
export const ChevronRightIcon = createLineIcon(
  "ChevronRightIcon",
  "M8 5l5 5-5 5"
)
export const ChevronLeftIcon = createLineIcon(
  "ChevronLeftIcon",
  "M12 5l-5 5 5 5"
)
export const FlagIcon = createLineIcon(
  "FlagIcon",
  "M5 17.5V3M5 3.5h9.5l-2 3.5 2 3.5H5"
)
export const MentionIcon = createLineIcon(
  "MentionIcon",
  `${circle(10, 10, 3)}M13 10v1.5a2 2 0 0 0 4 0V10a7 7 0 1 0-3 5.7`
)
export const CheckCircleIcon = createLineIcon(
  "CheckCircleIcon",
  `${circle(10, 10, 7)}M7 10l2 2 4-4`
)
export const ClockIcon = createLineIcon(
  "ClockIcon",
  `${circle(10, 10, 7)}M10 6v4l2.5 2`
)
export const ArrowSwapIcon = createLineIcon(
  "ArrowSwapIcon",
  "M4 7h11l-3-3M16 13H5l3 3"
)
export const EditIcon = createLineIcon(
  "EditIcon",
  "M13.5 3.5l3 3-9 9H4.5v-3ZM11.5 5.5l3 3"
)
export const MoreIcon = createLineIcon(
  "MoreIcon",
  "M5 10h.01M10 10h.01M15 10h.01"
)
export const BellIcon = createLineIcon(
  "BellIcon",
  "M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13ZM8.5 17a1.5 1.5 0 0 0 3 0"
)
export const InfoIcon = createLineIcon(
  "InfoIcon",
  `${circle(10, 10, 7)}M10 9v4.5M10 6.5h.01`
)
