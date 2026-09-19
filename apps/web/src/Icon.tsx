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
  Church,
  Circle,
  CircleDashed,
  Clock3,
  Copy,
  Crosshair,
  Crown,
  Dumbbell,
  Download,
  FileText,
  FlaskConical,
  FlaskRound,
  Focus,
  Footprints,
  Gem,
  Gift,
  GraduationCap,
  Hand,
  Handbag,
  HardHat,
  Key,
  KeyRound,
  Layers3,
  LayoutGrid,
  Lock,
  Medal,
  Minus,
  Orbit,
  PackageOpen,
  PawPrint,
  Pencil,
  Redo2,
  ScanLine,
  ScrollText,
  Shield,
  ShoppingCart,
  Shirt,
  Shuffle,
  Sparkles,
  SquareStar,
  Stamp,
  Star,
  Sun,
  Sword,
  Swords,
  Target,
  TestTube,
  Trash2,
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
  | "church"
  | "circle"
  | "class"
  | "clock"
  | "companion"
  | "content"
  | "crown"
  | "details"
  | "download"
  | "duplicate"
  | "dumbbell"
  | "edit"
  | "favorite"
  | "feat"
  | "flask-conical"
  | "flask-round"
  | "focus"
  | "footprints"
  | "gem"
  | "gift"
  | "hand"
  | "handbag"
  | "hard-hat"
  | "item"
  | "key"
  | "key-round"
  | "layers"
  | "level"
  | "lock"
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
  | "shopping-cart"
  | "shirt"
  | "skill"
  | "square-star"
  | "stamp"
  | "scroll-text"
  | "sun"
  | "sword"
  | "target"
  | "test-tube"
  | "trash"
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
  church: Church,
  circle: Circle,
  class: Shield,
  clock: Clock3,
  companion: PawPrint,
  content: LayoutGrid,
  crown: Crown,
  details: ScrollText,
  download: Download,
  duplicate: Copy,
  dumbbell: Dumbbell,
  edit: Pencil,
  favorite: Star,
  feat: Sparkles,
  "flask-conical": FlaskConical,
  "flask-round": FlaskRound,
  focus: Focus,
  footprints: Footprints,
  gem: Gem,
  gift: Gift,
  hand: Hand,
  handbag: Handbag,
  "hard-hat": HardHat,
  item: Backpack,
  key: Key,
  "key-round": KeyRound,
  layers: Layers3,
  level: ChevronsUp,
  lock: Lock,
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
  "shopping-cart": ShoppingCart,
  shirt: Shirt,
  skill: GraduationCap,
  "square-star": SquareStar,
  stamp: Stamp,
  "scroll-text": ScrollText,
  sun: Sun,
  sword: Sword,
  target: Target,
  "test-tube": TestTube,
  trash: Trash2,
  undo: Undo2,
  "wand-sparkles": WandSparkles,
  warning: TriangleAlert,
  waves: Waves,
};

export function Icon({ name }: { readonly name: IconName }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" className="icon" focusable="false" />;
}
