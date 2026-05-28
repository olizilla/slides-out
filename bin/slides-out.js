#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { parsePresentationId, parseDate, exportSlides } from '../lib/exporter.js';

const usage = `
Usage:
  slides-out <url-or-id> [options]

Arguments:
  <url-or-id>   Google Slides presentation URL or ID (required)

Options:
  -o, --out     Base output directory name (optional, defaults to title slug)
  --pub-date    ISO published date as YYYY-MM-DD, YYYY-MM, or YYYY (defaults to today)
  --max-slides  Limit the number of slides to export (useful for testing/previews)
  --alt-text    Alt text strategy: index, slide, speaker (default: slide)
  --text        Markdown content strategy: slide, speaker (default: speaker)
  --format      Output file format: md, html (default: md)
  -h, --help    Show this help message
`;

async function main() {
  try {
    const { values, positionals } = parseArgs({
      options: {
        'out': { type: 'string', short: 'o' },
        'pub-date': { type: 'string' },
        'max-slides': { type: 'string' },
        'alt-text': { type: 'string' },
        'text': { type: 'string' },
        'format': { type: 'string' },
        help: { type: 'boolean', short: 'h' }
      },
      allowPositionals: true,
      strict: true
    });

    if (values.help || positionals.length === 0) {
      console.log(usage);
      process.exit(0);
    }

    if (positionals.length > 1) {
      throw new Error('Too many positional arguments. Did you mean to use -o/--out for the output directory?');
    }

    const urlOrId = positionals[0];
    const presentationId = parsePresentationId(urlOrId);

    const outputDir = values['out'] || null;

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const defaultDateStr = `${yyyy}-${mm}-${dd}`;

    const dateStr = values['pub-date'] || defaultDateStr;
    const pubDateObj = parseDate(dateStr);

    const maxSlides = values['max-slides'] ? parseInt(values['max-slides'], 10) : undefined;
    if (maxSlides !== undefined && isNaN(maxSlides)) {
      throw new Error('--max-slides must be a valid number');
    }

    const altText = values['alt-text'] || 'slide';
    if (!['index', 'slide', 'speaker'].includes(altText)) {
      throw new Error('--alt-text must be one of: index, slide, speaker');
    }

    const text = values['text'] || 'speaker';
    if (!['slide', 'speaker'].includes(text)) {
      throw new Error('--text must be one of: slide, speaker');
    }

    const format = values['format'] || 'markdown';
    if (!['markdown', 'md', 'html'].includes(format)) {
      throw new Error('--format must be one of: markdown, md, html');
    }

    console.log(`Loading slides: ${presentationId}`)

    const result = await exportSlides(presentationId, outputDir, {
      pubDateObj,
      maxSlides,
      altText,
      text,
      format
    });

    console.log(`Done! Saved ${result.slidesCount} slides to: ${result.finalOutputDir}`);

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();

