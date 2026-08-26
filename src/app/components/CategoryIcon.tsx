import {
  Lock, KeyRound, ShieldCheck, Circle, Diamond, Gem, Sparkles,
  Link, Link2, Anchor, Crown, Heart, Bookmark, Shirt, Feather,
  Watch, Cpu, Footprints, Glasses, Tag,
  type LucideIcon,
} from "lucide-react";
import { PlugIcon, HandcuffsIcon, RingOIcon, GagIcon } from "@/app/components/deviceIcons";
import { type CategoryIcon } from "@/lib/categoryConstants";
import type { CSSProperties } from "react";

const ICON_MAP: Record<CategoryIcon, LucideIcon> = {
  // Die vier eigenen zuerst: sie benennen die Sache, die übrigen sind Anleihen.
  Plug: PlugIcon, Handcuffs: HandcuffsIcon, RingO: RingOIcon, Gag: GagIcon,
  Lock, KeyRound, ShieldCheck, Circle, Diamond, Gem, Sparkles,
  Link, Link2, Anchor, Crown, Heart, Bookmark, Shirt, Feather,
  Watch, Cpu, Footprints, Glasses, Tag,
};

interface Props {
  /** Icon name from CATEGORY_ICONS. Falls back to Tag if unknown (defensive: stored DB values). */
  name: string;
  className?: string;
  /** Für die Kategorie-Farbe: sie kommt aus der Datenbank und kann deshalb keine Klasse sein.
   *  Seit die Farbe nur noch im Zeichen sitzt und nicht mehr auf der Beschriftung, braucht sie
   *  hier einen Weg hinein. */
  style?: CSSProperties;
}

/** Renders a lucide-react icon by category-icon name. Use for DeviceCategory display. */
export default function CategoryIconRender({ name, className, style }: Props) {
  const Icon = ICON_MAP[name as CategoryIcon] ?? ICON_MAP.Tag;
  return <Icon className={className} style={style} aria-hidden />;
}
