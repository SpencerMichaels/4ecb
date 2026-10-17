import {
  Anvil,
  Award,
  Backpack,
  Badge,
  BicepsFlexed,
  Bone,
  BowArrow,
  BookMarked,
  BookOpen,
  Brain,
  Calculator,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  ChevronsUp,
  Church,
  Circle,
  CircleDashed,
  CircleDollarSign,
  CircleHelp,
  CircleX,
  Clock3,
  Timer,
  Copy,
  Crosshair,
  Crown,
  Dumbbell,
  Dices,
  Dice5,
  Download,
  Eye,
  FileText,
  HandFist,
  Heart,
  FlaskConical,
  FlaskRound,
  Focus,
  Footprints,
  Funnel,
  Gem,
  Gift,
  GraduationCap,
  Hand,
  Handbag,
  HardHat,
  House,
  Key,
  KeyRound,
  Layers3,
  LayoutGrid,
  Lock,
  Medal,
  Minus,
  Orbit,
  ZapOff,
  PackageOpen,
  PawPrint,
  Pencil,
  Redo2,
  SaveCheck,
  SaveOff,
  SavePen,
  Scale,
  ScanLine,
  Search,
  ScrollText,
  Shield,
  ShoppingCart,
  Shirt,
  Shuffle,
  Sparkles,
  SquareStar,
  Stamp,
  Skull,
  StepForward,
  Star,
  Sun,
  Sword,
  Swords,
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
  | "bow-arrow"
  | "book"
  | "book-marked"
  | "brain"
  | "calculator"
  | "character"
  | "check"
  | "chevron"
  | "church"
  | "circle"
  | "circle-dollar-sign"
  | "circle-help"
  | "circle-x"
  | "class"
  | "clock"
  | "timer"
  | "step-forward"
  | "dices"
  | "dice-5"
  | "zap-off"
  | "companion"
  | "content"
  | "crown"
  | "details"
  | "download"
  | "duplicate"
  | "dumbbell"
  | "edit"
  | "eye"
  | "favorite"
  | "feat"
  | "flask-conical"
  | "flask-round"
  | "focus"
  | "footprints"
  | "filter"
  | "gem"
  | "gift"
  | "hand"
  | "heart"
  | "fist"
  | "handbag"
  | "hard-hat"
  | "house"
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
  | "save-check"
  | "save-off"
  | "save-pen"
  | "scale"
  | "search"
  | "sheet"
  | "shield"
  | "shop"
  | "shopping-cart"
  | "shirt"
  | "skill"
  | "skull"
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
  "bow-arrow": BowArrow,
  book: BookOpen,
  "book-marked": BookMarked,
  brain: Brain,
  calculator: Calculator,
  character: UserRound,
  check: Check,
  chevron: ChevronRight,
  church: Church,
  circle: Circle,
  "circle-dollar-sign": CircleDollarSign,
  "circle-help": CircleHelp,
  "circle-x": CircleX,
  class: Shield,
  clock: Clock3,
  timer: Timer,
  "step-forward": StepForward,
  dices: Dices,
  "dice-5": Dice5,
  "zap-off": ZapOff,
  companion: PawPrint,
  content: LayoutGrid,
  crown: Crown,
  details: ScrollText,
  download: Download,
  duplicate: Copy,
  dumbbell: Dumbbell,
  edit: Pencil,
  eye: Eye,
  favorite: Star,
  feat: Sparkles,
  "flask-conical": FlaskConical,
  "flask-round": FlaskRound,
  focus: Focus,
  footprints: Footprints,
  filter: Funnel,
  gem: Gem,
  gift: Gift,
  hand: Hand,
  heart: Heart,
  fist: HandFist,
  handbag: Handbag,
  "hard-hat": HardHat,
  house: House,
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
  "save-check": SaveCheck,
  "save-off": SaveOff,
  "save-pen": SavePen,
  scale: Scale,
  search: Search,
  sheet: FileText,
  shield: Shield,
  shop: ShoppingCart,
  "shopping-cart": ShoppingCart,
  shirt: Shirt,
  skill: GraduationCap,
  skull: Skull,
  "square-star": SquareStar,
  stamp: Stamp,
  "scroll-text": ScrollText,
  sun: Sun,
  sword: Sword,
  target: Crosshair,
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
