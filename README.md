# slides-out

Get your slides out of Google Slides and into open formats:

- A single page markdown file with images and speaker notes
- a web ready .html file you can publish to your own site

```shell
npx slides-out https://docs.google.com/presentation/...
Loaded: "All the reasons i love u"
Saving: slide 1
...
Saving: index.md
Done! Saved 101 slides to: 2026-05-27-all-the-reasons-i-love-u
```

At the time of writing Slides export to PDF fails to export some emoji, breaks some layouts, and doesn't include speaker notes. The TXT export mixes slide text and speaker notes and you lose the slides images.

`slides-out` drives a web browser, takes screenshots, and gives you a markdown file with an image per slide. Adversarial interop via open formats!

## Getting Started

Run it via `npx`
```shell
npx slides-out <url-or-id>
```

Or, install it globally
```shell
npm install -g slides-out
slides-out <url-or-id>
```

## Usage

```shell
slides-out <url-or-id> [options]
```

### Arguments

- `<url-or-id>`: Google Slides presentation URL or ID (Required).

### Options

- `--format <format>`: Output file format: `markdown`, `md`, or `html` (default: `markdown`).
- `-o, --out <dir>`: Base output directory name (Optional, defaults to pub-date and slides title).
- `--pub-date <date>`: ISO published date as `YYYY-MM-DD`, `YYYY-MM`, or `YYYY` (default: today's date).
- `--text <strategy>`: Strategy for markdown slide body content: `slide` or `speaker` (default: `speaker`).
- `--alt-text <strategy>`: Alt text strategy for embedded images: `index`, `slide`, or `speaker` (default: `slide`).
- `--max-slides <number>`: Limit the number of slides to export (useful for testing/previews).
- `-h, --help`: Show usage details.

## Example

_Extract the first 2 slides to the `./example` dir. Use speaker notes as the text. Use the slide number as the image alt text._

```bash
slides-out 1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg \
-o example --alt-text index --text speaker --max-slides 2
```

**Output:**

```
./example
├── index.md
├── slide-1.png  # 1600x900px, 115kb
└── slide-2.png  # 1600x900px, 94kb
```

`example/index.md`

```md
# Digital Interop in the NHS

![Slide 1](slide-1.png)

I’m going to talk about digital interop in the NHS, starting with my motivation:
- the bad things that happen when it fails
- The realities of what is holding up progress
- Some ideas from academia on patterns of nation scale digital transformation.
- And then look at work that is happening here and in Catalonia.

![Slide 2](slide-2.png)

To declare my biases up front
I believe open source code, open data formats and open digital protocols are the essential ingredients for interoperability.
...
---

_Original Deck: [docs.google.com/presentation/d/1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg](https://docs.google.com/presentation/d/1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg/edit)_

_Published: 2026-05-28_

```

`example/slide-1.png`

![Slide 1](example/slide-1.png)


## How it works

- Open the slides in a headless browser with Playwright.
- Scrape speaker notes (`#speakernotes`) and slide visual text (SVG `<text>` elements).
- Clean up DOM to hide collaborators UI. (gross. sorry, i had to.)
- Find the bounding box of the slide background (`[id*="-bg"] path`)
- Screenshot the cropped region.
- Transition to the next slide. Repeat till we're at the end.
- Write it all out to markdown or html.

## Tests

We use Node.js's native test runner. Run the test suite:
```shell
npm test
```

## Smaller slides

The exported slide images are uncompressed .png files. To minimize the file sizes, use [`pngquant`](https://pngquant.org/) (_reduces file sizes as much as 70%_) or [imageOptim](https://imageoptim.com/)

```bash
# Install pngquant (e.g., brew install pngquant), then:
pngquant --ext .png --force --speed 1 slide-*.png
```
