import {
  Backpack,
  BookOpen,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  ChevronsUp,
  CircleDashed,
  CircleDot,
  Clock3,
  Crosshair,
  Feather,
  FileText,
  Footprints,
  GraduationCap,
  LayoutGrid,
  Minus,
  PawPrint,
  Redo2,
  Reply,
  ScanLine,
  ScrollText,
  Shield,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Star,
  Swords,
  TriangleAlert,
  Undo2,
  UserRound,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "ability"
  | "action-free"
  | "action-interrupt"
  | "action-minor"
  | "action-move"
  | "action-none"
  | "action-reaction"
  | "action-standard"
  | "attack-area"
  | "attack-close"
  | "attack-melee"
  | "attack-personal"
  | "attack-ranged"
  | "attack-versatile"
  | "background"
  | "book"
  | "class"
  | "character"
  | "companion"
  | "check"
  | "chevron"
  | "clock"
  | "content"
  | "details"
  | "feat"
  | "favorite"
  | "item"
  | "level"
  | "power"
  | "race"
  | "redo"
  | "remove"
  | "sheet"
  | "skill"
  | "undo"
  | "warning";

const icons: Record<IconName, LucideIcon> = {
  ability: ChartNoAxesColumnIncreasing,
  "action-free": Feather,
  "action-interrupt": ShieldAlert,
  "action-minor": CircleDot,
  "action-move": Footprints,
  "action-none": Minus,
  "action-reaction": Reply,
  "action-standard": Zap,
  "attack-area": CircleDashed,
  "attack-close": ScanLine,
  "attack-melee": Swords,
  "attack-personal": UserRound,
  "attack-ranged": Crosshair,
  "attack-versatile": Shuffle,
  background: ScrollText,
  book: BookOpen,
  class: Shield,
  character: UserRound,
  companion: PawPrint,
  check: Check,
  chevron: ChevronRight,
  clock: Clock3,
  content: LayoutGrid,
  details: ScrollText,
  feat: Sparkles,
  favorite: Star,
  item: Backpack,
  level: ChevronsUp,
  power: Zap,
  race: UsersRound,
  redo: Redo2,
  remove: X,
  sheet: FileText,
  skill: GraduationCap,
  undo: Undo2,
  warning: TriangleAlert,
};

export function Icon({ name }: { readonly name: IconName }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" className="icon" focusable="false" />;
}
