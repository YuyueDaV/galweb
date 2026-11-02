<script setup lang="ts">
import { House, MessagesSquare, LibraryBig, Trophy, CalendarDays, Users, Search, ArrowUpRight, ArrowRight, Plus, ChevronDown, ChevronRight, Sun, Moon, Menu, X, MessageCircle, Eye, Heart, Bookmark, Pin, Flame, Sparkles, SlidersHorizontal, Clock3, Hash, Check, Send, ArrowLeft, Quote, Info, Copy, Leaf, ImagePlus, Bell, LogIn, PenLine, ExternalLink, BookOpen, Star, Ellipsis } from 'lucide-vue-next'
import type { IconName } from '~/types/forum'
defineProps<{ name: IconName; size?: number }>()
const icons = { home: House, forum: MessagesSquare, library: LibraryBig, trophy: Trophy, calendar: CalendarDays, users: Users, search: Search, arrowUpRight: ArrowUpRight, arrowRight: ArrowRight, plus: Plus, chevronDown: ChevronDown, chevronRight: ChevronRight, sun: Sun, moon: Moon, menu: Menu, close: X, comment: MessageCircle, eye: Eye, heart: Heart, bookmark: Bookmark, pin: Pin, flame: Flame, sparkles: Sparkles, filter: SlidersHorizontal, clock: Clock3, hash: Hash, check: Check, send: Send, arrowLeft: ArrowLeft, quote: Quote, info: Info, copy: Copy, leaf: Leaf, image: ImagePlus, bell: Bell, login: LogIn, pen: PenLine, external: ExternalLink, book: BookOpen, star: Star, more: Ellipsis }
</script>

<template><component :is="icons[name]" :size="size || 18" :style="{ '--icon-size': `${(size || 18) / 16}rem` }" :stroke-width="1.7" aria-hidden="true" class="app-icon" /></template>
