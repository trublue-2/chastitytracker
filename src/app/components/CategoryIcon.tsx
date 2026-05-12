import {
  Lock, KeyRound, ShieldCheck, Circle, Diamond, Gem, Sparkles,
  Link, Link2, Anchor, Crown, Heart, Bookmark, Shirt, Feather,
  Watch, Cpu, Footprints, Glasses, Tag,
  type LucideIcon,
} from "lucide-react";
import { type CategoryIcon } from "@/lib/categoryConstants";

const ICON_MAP: Record<CategoryIcon, LucideIcon> = {
  Lock, KeyRound, ShieldCheck, Circle, Diamond, Gem, Sparkles,
  Link, Link2, Anchor, Crown, Heart, Bookmark, Shirt, Feather,
  Watch, Cpu, Footprints, Glasses, Tag,
};

interface Props {
  /** Icon name from CATEGORY_ICONS. Falls back to Tag if unknown (defensive: stored DB values). */
  name: string;
  className?: string;
}

/** Renders a lucide-react icon by category-icon name. Use for DeviceCategory display. */
export default function CategoryIconRender({ name, className }: Props) {
  const Icon = ICON_MAP[name as CategoryIcon] ?? ICON_MAP.Tag;
  return <Icon className={className} aria-hidden />;
}
