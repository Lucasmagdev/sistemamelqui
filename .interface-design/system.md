# Imperial Flow Gold — Design System

## Direction
**Dark Gold Premium** — interface escura de alto contraste com acentos dourados. Transmite exclusividade e confiança para um açougue premium.

## Foundation
- Background: `hsl(0 0% 6%)` — quase preto
- Card: `hsl(0 0% 10%)` — superfície elevada sutil
- Muted: `hsl(0 0% 14%)` — camadas terciárias
- Primary (ouro): `hsl(45 64% 52%)` — #C9A84C
- Secondary (ouro escuro): `hsl(37 76% 35%)`
- Accent (ouro claro): `hsl(45 93% 77%)`

## Depth Strategy
**Borders-only** (39 borders vs 2 shadows no código base)
- Bordas: `hsl(0 0% 20%)` — separação sutil entre superfícies
- Exceção: `--card-shadow-hover` com glow dourado para hover states
- Gradiente especial: `--gold-gradient` para CTAs e elementos hero

## Tokens

### Spacing
- Base: 4px (Tailwind scale)
- Gap dominante: `gap-2` = 8px (28x)
- Padding dominante: `px-3` = 12px (18x)
- Secundário: `px-4` = 16px, `py-2` = 8px

### Radius Scale
- Default: `rounded-md` = 6px (19x) — componentes base
- Elevado: `rounded-lg` = 8px, `rounded-xl` = 12px — cards
- Alto: `rounded-2xl` = 16px — modais, drawers
- Pill: `rounded-full` — badges, avatares, chips

### Typography
- Base: `text-sm` (14px) — body principal (36x)
- Auxiliar: `text-xs` (12px) — labels, metadados (22x)
- Destaque: `text-lg`, `text-xl` — títulos de seção
- Hero: `text-2xl`, `text-3xl` — headings principais
- Peso: `font-medium` para labels, `font-semibold` para headings

## Patterns

### Button Primary
- Height: `h-11` (44px)
- Padding: `px-4 py-2`
- Radius: `rounded-md` ou `rounded-full` para pill
- Background: `bg-primary` com `text-primary-foreground`
- Hover: glow dourado via `--gold-shadow`

### Button Ghost / Outline
- Background: transparente, `border border-primary/35`
- Hover: `bg-primary/15`

### Card Default
- Background: `bg-card`
- Border: `border border-border`
- Radius: `rounded-xl`
- Padding: `p-3` ou `p-4`
- Hover: `--card-shadow-hover` com glow dourado sutil

### Input
- Background: `bg-input` = `hsl(0 0% 18%)`
- Border: `border border-border`
- Focus: `ring-primary`
- Radius: `rounded-md`

### Badge / Chip
- Radius: `rounded-full`
- Padding: `px-2 py-0.5`
- Active: `bg-primary text-primary-foreground`
- Inactive: `bg-muted text-muted-foreground`

### Category Tab
- Pill horizontal scroll
- Active: fundo dourado `bg-primary`, texto escuro
- Inactive: `bg-muted`, texto `text-muted-foreground`

## Special Tokens
```css
--gold-gradient: linear-gradient(135deg, hsl(37 76% 35%), hsl(45 64% 52%), hsl(45 93% 77%));
--gold-shadow: 0 8px 34px -12px hsla(45, 64%, 52%, 0.55);
--card-shadow: 0 10px 30px -18px hsla(0,0%,0%,0.8), inset 0 1px 0 hsla(45,22%,85%,0.05);
--card-shadow-hover: 0 18px 44px -18px hsla(0,0%,0%,0.95), 0 0 20px -8px hsla(45,64%,52%,0.28);
```

## Anti-patterns
- Não usar fundo branco ou claro em nenhuma superfície
- Não usar sombras genéricas (shadow-md) — usar as custom vars
- Não misturar radius: cards sempre xl/2xl, botões sempre md/full
- Não usar cores fora da paleta ouro/escuro — manter coerência premium

## Last updated
2026-03-30
