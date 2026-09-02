import {
  Backpack,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  ChevronsUp,
  Clock3,
  FileText,
  GraduationCap,
  LayoutGrid,
  Redo2,
  ScrollText,
  Shield,
  Sparkles,
  TriangleAlert,
  Undo2,
  UserRound,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "ability"
  | "background"
  | "book"
  | "class"
  | "character"
  | "check"
  | "chevron"
  | "clock"
  | "content"
  | "details"
  | "feat"
  | "item"
  | "level"
  | "power"
  | "race"
  | "redo"
  | "sheet"
  | "skill"
  | "undo"
  | "warning";

const icons: Record<IconName, LucideIcon> = {
  ability: ChartNoAxesColumnIncreasing,
  background: ScrollText,
  book: BookOpen,
  class: Shield,
  character: UserRound,
  check: Check,
  chevron: ChevronRight,
  clock: Clock3,
  content: LayoutGrid,
  details: ScrollText,
  feat: Sparkles,
  item: Backpack,
  level: ChevronsUp,
  power: Zap,
  race: UsersRound,
  redo: Redo2,
  sheet: FileText,
  skill: GraduationCap,
  undo: Undo2,
  warning: TriangleAlert,
};

export function Icon({ name }: { readonly name: IconName }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" className="icon" focusable="false" />;
}
