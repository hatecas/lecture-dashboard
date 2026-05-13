## Overview

This presentation system is built for 16:9 slide decks using exclusively Pretendard font family. The design philosophy adapts Nike's editorial minimalism to slide format: bold typography, high-contrast black-and-white palette, and consistent spatial anchoring across all slides. Every slide follows strict positional rules—chapter markers, titles, and subtitles occupy fixed coordinates so viewers experience rhythmic consistency as they progress through the deck.

Content density is intentionally high: slides fill vertical space from title zone through body to footer, avoiding empty lower thirds. The system achieves visual breathing through whitespace between elements, not through sparse layouts.

**Key Characteristics:**
- **Pretendard-only typography**: All text uses Pretendard font family (Black, ExtraBold, Bold, SemiBold, Medium, Regular, Light, ExtraLight, Thin)
- **16:9 slide canvas**: 1920×1080px at 100% scale; all measurements in this spec reference this resolution
- **Fixed positional grid**: Chapter markers at (80, 80), titles at (80, 200), subtitles at (80, 280), body content starts at (80, 360)
- **High content density**: Body zones extend to within 100px of slide bottom, utilizing full available vertical space
- **Editorial contrast**: Campaign-scale display type (96–120px) paired with tight body type (16–20px)
- **Black/white/single-gray system**: `#111111` (ink), `#FFFFFF` (canvas), `#F5F5F5` (soft-cloud) carry 95% of surface area

## Colors

### Brand & Accent
- **Ink** (`{colors.ink}` — `#111111`): Primary text, titles, chapter markers, bullet points, dividers, all emphasis elements
- **Canvas** (`{colors.canvas}` — `#FFFFFF`): Slide background, text on dark surfaces, negative space

### Surface
- **Soft Cloud** (`{colors.soft-cloud}` — `#F5F5F5`): Image placeholder backgrounds, card fills, callout boxes, subtle section backgrounds
- **Hairline** (`{colors.hairline}` — `#CACACB`): 1px divider lines, table borders, separator rules
- **Hairline Soft** (`{colors.hairline-soft}` — `#E5E5E5`): Subtle dividers within content blocks

### Text Hierarchy
- **Ink** (`{colors.ink}` — `#111111`): Titles, headings, body text, chapter markers
- **Charcoal** (`{colors.charcoal}` — `#39393B`): Secondary body text where ink is too heavy
- **Mute** (`{colors.mute}` — `#707072`): Subtitles, captions, metadata, footnotes
- **Stone** (`{colors.stone}` — `#9E9EA0`): Tertiary metadata, slide numbers, timestamps

### Semantic (use sparingly)
- **Sale** (`{colors.sale}` — `#D30005`): Critical callouts, warnings, negative metrics only
- **Success** (`{colors.success}` — `#007D48`): Success states, positive metrics, checkmarks
- **Info** (`{colors.info}` — `#1151FF`): Hyperlinks, informational badges (use minimally)

### Accent Colors (editorial moments only)
Use only in data visualization or branded chapter dividers—never for body text or primary UI:
- **Accent Pink** (`{colors.accent-pink}` — `#ED1AA0`)
- **Accent Teal** (`{colors.accent-teal}` — `#0A7281`)
- **Accent Purple Soft** (`{colors.accent-purple-soft}` — `#BEAFFD`)

## Typography

### Font Family: Pretendard Only
All text must use Pretendard with appropriate weights:
- **Pretendard Black** (900): Chapter numbers, campaign display headlines
- **Pretendard ExtraBold** (800): Section openers, major slide titles
- **Pretendard Bold** (700): Slide titles, emphasis headers
- **Pretendard SemiBold** (600): Subtitles, subheadings, list headers
- **Pretendard Medium** (500): Body text emphasis, captions with weight
- **Pretendard Regular** (400): Body copy, bulleted lists, paragraph text
- **Pretendard Light** (300): Secondary body, long-form footnotes
- **Pretendard ExtraLight** (200): Reserved for large-scale watermark text only
- **Pretendard Thin** (100): Not recommended for slides (poor legibility)

### Type Scale & Usage

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-hero}` | 120px | Black (900) | 1.0 | -1% | Chapter divider slides only |
| `{typography.display-campaign}` | 96px | ExtraBold (800) | 1.1 | -0.5% | Section opener titles |
| `{typography.heading-xl}` | 64px | Bold (700) | 1.2 | 0 | Main slide title |
| `{typography.heading-lg}` | 48px | Bold (700) | 1.2 | 0 | Secondary slide title, large emphasis |
| `{typography.heading-md}` | 32px | SemiBold (600) | 1.3 | 0 | Subtitle, section header within slide |
| `{typography.heading-sm}` | 24px | SemiBold (600) | 1.4 | 0 | List section headers, card titles |
| `{typography.body-lg}` | 20px | Regular (400) | 1.6 | 0 | Primary body text for standard slides |
| `{typography.body-md}` | 18px | Regular (400) | 1.5 | 0 | Secondary body text, dense content slides |
| `{typography.body-sm}` | 16px | Regular (400) | 1.5 | 0 | Captions, footnotes, table cells |
| `{typography.body-emphasis}` | 20px | Medium (500) | 1.6 | 0 | Emphasized body text, key takeaways |
| `{typography.caption-lg}` | 16px | Medium (500) | 1.5 | 0 | Image captions, data labels |
| `{typography.caption-md}` | 14px | Regular (400) | 1.5 | 0 | Chart annotations, metadata |
| `{typography.caption-sm}` | 12px | Regular (400) | 1.5 | 0 | Slide numbers, timestamps, legal text |

### Typography Principles
- **Contrast through weight, not size jumps**: Use Pretendard's 9-weight range to create hierarchy without excessive size variation
- **Consistent baseline grid**: All text aligns to 4px baseline grid for vertical rhythm
- **Negative letter-spacing on display sizes**: -1% on 120px, -0.5% on 96px to maintain optical tightness
- **No center-alignment for body text**: Left-align all paragraphs and lists; center-align only titles and hero text on chapter dividers

## Layout System

### 16:9 Canvas Specifications
- **Resolution**: 1920×1080px (100% scale)
- **Safe margins**: 80px left/right, 60px top, 100px bottom
- **Content area**: 1760×920px usable space

### Fixed Positional Grid

Every slide type follows these Y-axis anchors:

| Element | X Position | Y Position | Purpose |
|---|---|---|---|
| Chapter marker | 80 | 80 | Small persistent label (e.g., "01 / Introduction") |
| Main title | 80 | 200 | Primary slide heading |
| Subtitle | 80 | 280 | Secondary heading or context |
| Body content start | 80 | 360 | First line of body text, lists, or visuals |
| Footer zone start | 80 | 920 | Metadata, page numbers, dividers |
| Right content column | 1040 | 360 | For two-column layouts (40px gutter from center) |

### Spacing Scale
- **Base unit**: 8px
- **Tokens**: 
  - `{spacing.xxs}` = 4px
  - `{spacing.xs}` = 8px
  - `{spacing.sm}` = 16px
  - `{spacing.md}` = 24px
  - `{spacing.lg}` = 32px
  - `{spacing.xl}` = 48px
  - `{spacing.xxl}` = 64px
  - `{spacing.section}` = 80px (between major slide sections)

### Content Density Rules

**High-density principle**: Slides should utilize vertical space from Y=360 through Y=920 (560px of body height). Avoid leaving bottom thirds empty.

**Achieving density without crowding**:
- Use `{spacing.sm}` (16px) between list items
- Use `{spacing.md}` (24px) between paragraphs
- Use `{spacing.lg}` (32px) between distinct content blocks
- If content naturally ends above Y=800, add supporting elements: data callouts, footnotes, related visuals, or subtle background patterns

**Example vertical fills**:
- Short bullet list (3 items): Add a supporting quote box or stat callout below
- Single-column text ending at Y=700: Add image strip or horizontal divider with metadata
- Two-column layout with uneven columns: Extend shorter column with caption or illustration

## Slide Templates

### 1. Chapter Divider
**Purpose**: Section openers
**Layout**:
- Background: `{colors.ink}` (full bleed)
- Chapter number: `{typography.display-hero}` Pretendard Black, `{colors.canvas}`, positioned (80, 300)
- Chapter title: `{typography.display-campaign}` Pretendard ExtraBold, `{colors.canvas}`, positioned (80, 480)
- Optional subtitle: `{typography.heading-md}` Pretendard SemiBold, `{colors.stone}`, positioned (80, 620)
- No body content—this is a visual break

### 2. Title Slide
**Purpose**: Opening slide, major section intros
**Layout**:
- Chapter marker: `{typography.caption-md}` Pretendard Medium, `{colors.mute}`, at (80, 80)
- Title: `{typography.heading-xl}` Pretendard Bold, `{colors.ink}`, at (80, 200)
- Subtitle: `{typography.heading-md}` Pretendard SemiBold, `{colors.charcoal}`, at (80, 300)
- Supporting text: `{typography.body-lg}` Pretendard Regular, `{colors.ink}`, starts at (80, 380), extends to Y=880
- Footer divider: 1px `{colors.hairline}` at Y=940, slide number `{typography.caption-sm}` at (1840, 960)

### 3. Content Slide (Single Column)
**Purpose**: Standard body content
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200)
- Subtitle (if needed): `{typography.heading-sm}` at (80, 280)
- Body text: `{typography.body-lg}`, starts at (80, 360), left-aligned, max-width 1600px
- Body extends to Y=920 using paragraphs, lists, callouts, or supporting visuals
- Footer: divider + metadata at Y=940–1020

### 4. Content Slide (Two Column)
**Purpose**: Side-by-side content blocks
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200)
- Left column: X=80, Y=360, width=860px
- Right column: X=1040, Y=360, width=860px (40px gutter)
- Both columns extend to Y=920
- If one column is shorter, fill with: image, quote, stat box, or subtle illustration

### 5. List Slide
**Purpose**: Bulleted or numbered lists
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200)
- List items: `{typography.body-lg}` Pretendard Regular, starts at (80, 360)
- Bullet style: 8px solid circle in `{colors.ink}`, 24px left of text
- Vertical spacing: `{spacing.sm}` (16px) between items
- If list ends before Y=800, add: key takeaway box, supporting stat, or footer annotation
- Minimum 6 list items per slide to maintain density; if fewer, increase font size to `{typography.body-lg}` or add supplementary content

### 6. Image + Caption Slide
**Purpose**: Visual focus with supporting text
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200)
- Image: positioned at (80, 360), max dimensions 1760×460px, background `{colors.soft-cloud}` if needed
- Caption: `{typography.caption-lg}` Pretendard Medium, `{colors.mute}`, at (80, 840), extends to Y=920
- If caption is short, add: credit line, related stat, or horizontal divider with metadata

### 7. Data Slide (Charts/Tables)
**Purpose**: Quantitative content
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200)
- Chart/table: positioned at (80, 360), dimensions up to 1760×500px
- Data labels: `{typography.caption-md}` Pretendard Regular
- Footer annotation: `{typography.body-sm}` at (80, 880), extends to Y=920 with source citation or methodology note
- Use `{colors.ink}` for primary data series, `{colors.accent-teal}` or `{colors.accent-pink}` sparingly for secondary series

### 8. Quote Slide
**Purpose**: Testimonial or emphasized statement
**Layout**:
- Chapter marker: at (80, 80)
- Title: `{typography.heading-lg}` at (80, 200) (or omit for full-bleed quote)
- Quote text: `{typography.heading-md}` Pretendard SemiBold, `{colors.ink}`, centered vertically between Y=360 and Y=840, max-width 1400px, centered horizontally
- Attribution: `{typography.body-md}` Pretendard Regular, `{colors.mute}`, at (80, 880)
- Footer: divider at Y=940

## Components

### Text Components

**`title-primary`**
- Type: `{typography.heading-xl}` Pretendard Bold
- Color: `{colors.ink}`
- Position: X=80, Y=200
- Max width: 1600px (allows for long titles without wrapping awkwardly)

**`title-secondary`**
- Type: `{typography.heading-lg}` Pretendard Bold
- Color: `{colors.ink}`
- Position: X=80, Y=200
- Use when primary title is too large for content density

**`subtitle`**
- Type: `{typography.heading-md}` Pretendard SemiBold
- Color: `{colors.charcoal}`
- Position: X=80, Y=280 (or Y+80 below title)

**`chapter-marker`**
- Type: `{typography.caption-md}` Pretendard Medium
- Color: `{colors.mute}`
- Position: X=80, Y=80
- Format: "01 / Chapter Name" or "Section 1" or "Introduction"

**`body-paragraph`**
- Type: `{typography.body-lg}` Pretendard Regular
- Color: `{colors.ink}`
- Line height: 1.6
- Max width: 1600px (single column) or 860px (two-column)
- Spacing: `{spacing.md}` (24px) between paragraphs

**`list-item`**
- Type: `{typography.body-lg}` Pretendard Regular
- Color: `{colors.ink}`
- Bullet: 8px solid circle `{colors.ink}`, 24px left margin
- Spacing: `{spacing.sm}` (16px) between items

**`caption`**
- Type: `{typography.caption-lg}` Pretendard Medium
- Color: `{colors.mute}`
- Use for: image captions, chart annotations, footnotes

**`footer-metadata`**
- Type: `{typography.caption-sm}` Pretendard Regular
- Color: `{colors.stone}`
- Position: Y=960 or below
- Content: slide numbers, dates, confidentiality notices

### Visual Components

**`divider-horizontal`**
- Height: 1px
- Color: `{colors.hairline}`
- Width: 1760px (full content width) or custom
- Common positions: Y=940 (above footer), Y=340 (below subtitle)

**`callout-box`**
- Background: `{colors.soft-cloud}`
- Padding: `{spacing.md}` (24px) all sides
- Border radius: 0px (sharp corners per Nike system)
- Text: `{typography.body-md}` Pretendard Medium, `{colors.ink}`
- Use for: key takeaways, stats, side notes

**`stat-display`**
- Number: `{typography.display-campaign}` Pretendard ExtraBold, `{colors.ink}`
- Label: `{typography.caption-lg}` Pretendard Medium, `{colors.mute}`, positioned below number with `{spacing.xs}` gap
- Container: Optional `{colors.soft-cloud}` background with `{spacing.lg}` padding

**`image-container`**
- Background: `{colors.soft-cloud}` (when image has transparency or needs neutral staging)
- Border: None (images sit directly on background)
- Aspect ratio: Maintain original; do not force 16:9 on content images
- Max dimensions: 1760×560px for full-width images

**`table-cell`**
- Text: `{typography.body-sm}` Pretendard Regular
- Padding: `{spacing.sm}` (16px) horizontal, `{spacing.xs}` (8px) vertical
- Border: 1px `{colors.hairline}` between cells
- Header: `{typography.body-sm}` Pretendard SemiBold, `{colors.ink}`

## Do's and Don'ts

### Do
- **Lock positional anchors**: Keep chapter markers at (80, 80), titles at (80, 200), body at (80, 360) across all slides for rhythm consistency
- **Use only Pretendard**: No fallback fonts, no system defaults—embed all 9 weights in the presentation file
- **Fill vertical space**: Extend content to Y=920; if natural content ends earlier, add footnotes, captions, dividers, or supporting visuals
- **Maintain high contrast**: Reserve `{colors.ink}` for primary text; use `{colors.charcoal}` or `{colors.mute}` sparingly for de-emphasis
- **Leverage weight variation**: Use Pretendard's 9 weights to create hierarchy without excessive size changes
- **Align to 4px grid**: All Y positions and spacings should be multiples of 4 for baseline rhythm

### Don't
- **Don't use fonts other than Pretendard**: No Arial, Helvetica, or system fallbacks—this is a single-font system
- **Don't center-align body text**: Left-align paragraphs and lists; center only titles on hero slides
- **Don't leave bottom thirds empty**: If content ends above Y=800, fill with captions, annotations, or metadata
- **Don't use decorative shadows or gradients**: Flat surfaces only; depth comes from typography scale and color contrast
- **Don't mix aspect ratios**: All slides are 16:9 (1920×1080px)—no portrait slides, no custom dimensions
- **Don't use more than 2 accent colors per slide**: Reserve `{colors.accent-pink}`, `{colors.accent-teal}` for data visualization only; avoid using them for decorative elements
- **Don't place titles at arbitrary Y positions**: Stick to the positional grid (Y=200 for titles, Y=280 for subtitles)

## Content Density Strategies

### When Content Naturally Ends Early

If your body content concludes before Y=800, use these strategies to fill vertical space without compromising design:

1. **Add supporting statistics**: Insert a `{component.stat-display}` below main content
2. **Include footnotes**: Add methodology, sources, or disclaimers using `{typography.caption-md}`
3. **Insert horizontal divider + metadata**: Place `{component.divider-horizontal}` at Y=880 with timestamp or author info below
4. **Add illustrative element**: Small icon, logo, or abstract shape in `{colors.soft-cloud}` as visual anchor
5. **Extend list items**: Increase spacing between items from `{spacing.sm}` to `{spacing.md}`, or add sub-bullets
6. **Include pull quote**: Extract key sentence from body text, display at `{typography.heading-sm}` with `{colors.charcoal}`

### Minimum Content Guidelines

- **List slides**: Minimum 6 items; if fewer, increase font size or add explanatory sub-text per item
- **Paragraph slides**: Minimum 3 paragraphs or 200 words; if less, pair with image or callout box
- **Image slides**: Always include caption of 2–3 lines minimum; add source credit or related stat
- **Data slides**: Include footer annotation explaining data source, date range, or calculation method

## Iteration Checklist

Before finalizing any slide:

1. ✓ Chapter marker present at (80, 80)?
2. ✓ Title positioned at (80, 200)?
3. ✓ Subtitle (if used) at (80, 280)?
4. ✓ Body content starts at (80, 360)?
5. ✓ Content extends to at least Y=880?
6. ✓ All text uses Pretendard font family?
7. ✓ Primary text in `{colors.ink}`, secondary in `{colors.mute}`?
8. ✓ Spacing follows 8px base unit (4/8/16/24/32/48px)?
9. ✓ Footer elements (divider, slide number) positioned at Y=940+?
10. ✓ No centered body text (except hero/quote slides)?

## Technical Implementation Notes

### Font Loading
Ensure all 9 Pretendard weights are embedded:
- Pretendard-Thin.otf (100)
- Pretendard-ExtraLight.otf (200)
- Pretendard-Light.otf (300)
- Pretendard-Regular.otf (400)
- Pretendard-Medium.otf (500)
- Pretendard-SemiBold.otf (600)
- Pretendard-Bold.otf (700)
- Pretendard-ExtraBold.otf (800)
- Pretendard-Black.otf (900)

### Slide Master Setup
Create slide masters with locked elements:
- Chapter marker text box at (80, 80, 400, 40)
- Title text box at (80, 200, 1760, 80)
- Subtitle text box at (80, 280, 1760, 60)
- Body text box at (80, 360, 1760, 560)
- Footer divider line at (80, 940, 1760, 1)
- Slide number at (1800, 960, 40, 40)

### Color Palette Export
```
{
  "ink": "#111111",
  "canvas": "#FFFFFF",
  "soft-cloud": "#F5F5F5",
  "hairline": "#CACACB",
  "hairline-soft": "#E5E5E5",
  "charcoal": "#39393B",
  "mute": "#707072",
  "stone": "#9E9EA0",
  "sale": "#D30005",
  "success": "#007D48",
  "info": "#1151FF",
  "accent-pink": "#ED1AA0",
  "accent-teal": "#0A7281",
  "accent-purple-soft": "#BEAFFD"
}
```

### Baseline Grid
All Y-axis measurements align to 4px increments:
- 80, 200, 280, 360, 880, 920, 940, 960, 1020

This ensures vertical rhythm across all slides and prevents sub-pixel rendering issues.

---

**System Version**: 1.0
**Last Updated**: 2026-05-13
**Canvas Specification**: 1920×1080px (16:9)
**Font System**: Pretendard (9 weights)
**Design Philosophy**: Editorial minimalism with high content density
