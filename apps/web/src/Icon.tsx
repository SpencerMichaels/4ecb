import {
  Anvil,
  ArchiveRestore,
  ArrowDownUp,
  ArrowLeft,
  Award,
  Backpack,
  Badge,
  BadgeCheck,
  BicepsFlexed,
  Bone,
  BowArrow,
  BookMarked,
  BookCheck,
  BookOpen,
  Brain,
  Calculator,
  ChartNoAxesColumnIncreasing,
  Check,
  ChartPie,
  ChevronRight,
  ChevronsRight,
  ChevronsUp,
  Church,
  Circle,
  CircleArrowUp,
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
  Coins,
  Download,
  Eye,
  FileText,
  FolderInput,
  HandFist,
  Heart,
  HeartPlus,
  Droplets,
  FlaskConical,
  FlaskRound,
  Focus,
  Footprints,
  Funnel,
  Gem,
  Gift,
  GraduationCap,
  GripVertical,
  Hand,
  Handbag,
  HardHat,
  House,
  Key,
  KeyRound,
  Layers3,
  ListChecks,
  LayoutGrid,
  Lock,
  Medal,
  Minus,
  Orbit,
  TrendingUp,
  PackageOpen,
  PawPrint,
  Pencil,
  Redo2,
  RedoDot,
  SaveCheck,
  SaveOff,
  SavePen,
  Scale,
  ScanLine,
  Search,
  Settings,
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
  Printer,
  UserRound,
  UserRoundPlus,
  UsersRound,
  WandSparkles,
  Waves,
  X,
  Zap,
  type LucideIcon,
  SquareArrowRightExit,
} from "lucide-react";

export type IconName =
  | "ability"
  | "action-minor"
  | "action-move"
  | "action-none"
  | "action-opportunity"
  | "action-reaction"
  | "anvil"
  | "archive-restore"
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
  | "circle-arrow-up"
  | "circle-dollar-sign"
  | "circle-help"
  | "circle-x"
  | "class"
  | "clock"
  | "timer"
  | "step-forward"
  | "dices"
  | "dice-5"
  | "trending-up"
  | "companion"
  | "consolidate"
  | "content"
  | "crown"
  | "details"
  | "affordable"
  | "download"
  | "export"
  | "known"
  | "proficient"
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
  | "grip"
  | "hand"
  | "heart"
  | "heart-plus"
  | "droplets"
  | "fist"
  | "handbag"
  | "hard-hat"
  | "house"
  | "import"
  | "item"
  | "key"
  | "key-round"
  | "layers"
  | "list-checks"
  | "level"
  | "lock"
  | "medal"
  | "new-character"
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
  | "settings"
  | "sheet"
  | "back"
  | "change-level"
  | "print"
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
  "action-minor": ChartPie,
  "action-move": ChevronsRight,
  "action-none": Minus,
  "action-opportunity": RedoDot,
  "action-reaction": Redo2,
  anvil: Anvil,
  "archive-restore": ArchiveRestore,
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
  "circle-arrow-up": CircleArrowUp,
  "circle-dollar-sign": CircleDollarSign,
  "circle-help": CircleHelp,
  "circle-x": CircleX,
  class: Shield,
  clock: Clock3,
  timer: Timer,
  "step-forward": StepForward,
  dices: Dices,
  "dice-5": Dice5,
  "trending-up": TrendingUp,
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
  grip: GripVertical,
  hand: Hand,
  heart: Heart,
  "heart-plus": HeartPlus,
  droplets: Droplets,
  fist: HandFist,
  handbag: Handbag,
  "hard-hat": HardHat,
  house: House,
  import: FolderInput,
  export: SquareArrowRightExit,
  affordable: Coins,
  consolidate: Coins,
  proficient: BadgeCheck,
  known: BookCheck,
  item: Backpack,
  key: Key,
  "key-round": KeyRound,
  layers: Layers3,
  "list-checks": ListChecks,
  level: ChevronsUp,
  lock: Lock,
  medal: Medal,
  "new-character": UserRoundPlus,
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
  settings: Settings,
  sheet: FileText,
  back: ArrowLeft,
  "change-level": ArrowDownUp,
  print: Printer,
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
