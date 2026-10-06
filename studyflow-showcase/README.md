# StudyFlow showcase

A standalone marketing and tour page for StudyFlow. It is deliberately a
separate project from the app itself: nothing here is served by the StudyFlow
server, and nothing here is required for the app to run.

## Run it

There is nothing to build and no dependencies to install. Open
`index.html` in a browser, or serve the folder with any static server:

```powershell
npx serve .
```

Simply double-clicking `index.html` also works, because the page uses no
modules and no fetch calls.

## What is in it

- `index.html` — the whole page: nav, hero, six-part tour, free versus premium
  plans, build notes, privacy, and the closing call to action.
- `css/showcase.css` — all styling, including the app window drawn in CSS in
  the hero. There are no image files, so nothing can 404.

## Editing it

Colours, spacing and radii are CSS custom properties at the top of
`css/showcase.css`. Change `--brand-grad` and the whole page follows.

To add a section, copy an existing `<section class="band">` block. The `.band`
class handles the width and spacing; `.alt` gives it the alternate background.

The `#start` links point nowhere yet. Set them to wherever the real signup page
lives before showing this to anyone.