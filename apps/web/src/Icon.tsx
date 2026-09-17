import {
  Anvil,
  Award,
  Backpack,
  Badge,
  BicepsFlexed,
  Bone,
  BookMarked,
  BookOpen,
  Brain,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  ChevronsUp,
  Circle,
  CircleDashed,
  Clock3,
  Crosshair,
  Crown,
  Dumbbell,
  FileText,
  FlaskConical,
  FlaskRound,
  Focus,
  Footprints,
  Gem,
  Gift,
  GraduationCap,
  Hand,
  Key,
  KeyRound,
  Layers3,
  LayoutGrid,
  Medal,
  Minus,
  Orbit,
  PackageOpen,
  PawPrint,
  Redo2,
  ScanLine,
  ScrollText,
  Shield,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Stamp,
  Star,
  Sun,
  Sword,
  Swords,
  Target,
  TestTube,
  TriangleAlert,
  Undo2,
  UserRound,
  UsersRound,
  WandSparkles,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "ability"
  | "action-none"
  | "anvil"
  | "arms"
  | "attack-area"
  | "attack-close"
  | "attack-melee"
  | "attack-personal"
  | "attack-ranged"
  | "attack-versatile"
  | "award"
  | "background"
  | "badge"
  | "bone"
  | "book"
  | "book-marked"
  | "brain"
  | "character"
  | "check"
  | "chevron"
  | "circle"
  | "class"
  | "clock"
  | "companion"
  | "content"
  | "crown"
  | "details"
  | "dumbbell"
  | "favorite"
  | "feat"
  | "flask-conical"
  | "flask-round"
  | "focus"
  | "footprints"
  | "gem"
  | "gift"
  | "hand"
  | "item"
  | "key"
  | "key-round"
  | "layers"
  | "level"
  | "medal"
  | "orbit"
  | "package-open"
  | "paw-print"
  | "power"
  | "race"
  | "redo"
  | "remove"
  | "sheet"
  | "shield"
  | "shop"
  | "skill"
  | "stamp"
  | "sun"
  | "sword"
  | "target"
  | "test-tube"
  | "undo"
  | "wand-sparkles"
  | "warning"
  | "waves";

const icons: Record<IconName, LucideIcon> = {
  ability: ChartNoAxesColumnIncreasing,
  "action-none": Minus,
  anvil: Anvil,
  arms: BicepsFlexed,
  "attack-area": CircleDashed,
  "attack-close": ScanLine,
  "attack-melee": Swords,
  "attack-personal": UserRound,
  "attack-ranged": Crosshair,
  "attack-versatile": Shuffle,
  award: Award,
  background: ScrollText,
  badge: Badge,
  bone: Bone,
  book: BookOpen,
  "book-marked": BookMarked,
  brain: Brain,
  character: UserRound,
  check: Check,
  chevron: ChevronRight,
  circle: Circle,
  class: Shield,
  clock: Clock3,
  companion: PawPrint,
  content: LayoutGrid,
  crown: Crown,
  details: ScrollText,
  dumbbell: Dumbbell,
  favorite: Star,
  feat: Sparkles,
  "flask-conical": FlaskConical,
  "flask-round": FlaskRound,
  focus: Focus,
  footprints: Footprints,
  gem: Gem,
  gift: Gift,
  hand: Hand,
  item: Backpack,
  key: Key,
  "key-round": KeyRound,
  layers: Layers3,
  level: ChevronsUp,
  medal: Medal,
  orbit: Orbit,
  "package-open": PackageOpen,
  "paw-print": PawPrint,
  power: Zap,
  race: UsersRound,
  redo: Redo2,
  remove: X,
  sheet: FileText,
  shield: Shield,
  shop: ShoppingCart,
  skill: GraduationCap,
  stamp: Stamp,
  sun: Sun,
  sword: Sword,
  target: Target,
  "test-tube": TestTube,
  undo: Undo2,
  "wand-sparkles": WandSparkles,
  warning: TriangleAlert,
  waves: Waves,
};

export function Icon({ name }: { readonly name: IconName }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" className="icon" focusable="false" />;
}
