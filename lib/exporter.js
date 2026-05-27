import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { 
  toRichText, 
  renderMarkdown, 
  linkify, 
  getRichText, 
  buildRichText,
  detectLinkFacets,
  renderHtml,
  escapeHtml
} from './richtext.js';
import { generateHtml } from './html.js';

export { toRichText, renderMarkdown, linkify, detectLinkFacets, renderHtml, escapeHtml, generateHtml };

/**
 * Viewport dimensions designed to produce a clean 1600x900px slide canvas screenshot.
 * Google Slides editor UI currently adds a fixed overhead of 367px width and 206px height.
 */
export const VIEWPORT_WIDTH = 1967;  // 1600 + 367
export const VIEWPORT_HEIGHT = 1106; // 900 + 206

/**
 * Parses Google Slides URL or returns bare ID.
 */
export function parsePresentationId(urlOrId) {
  if (!urlOrId) {
    throw new Error('Presentation URL or ID is required');
  }
  const match = urlOrId.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }
  if (urlOrId.includes('://') || urlOrId.includes('.')) {
    throw new Error('Invalid Google Slides URL');
  }
  if (/^[a-zA-Z0-9_-]+$/.test(urlOrId)) {
    return urlOrId;
  }
  throw new Error('Invalid Google Slides ID');
}

/**
 * Validates and parses custom ISO date with YYYY-MM-DD, YYYY-MM, or YYYY precision.
 */
export function parseDate(dateStr) {
  if (!dateStr) {
    throw new Error('Date string is required');
  }
  if (dateStr.includes('T')) {
    const [datePart] = dateStr.split('T');
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return { value: datePart, format: 'YYYY-MM-DD' };
      }
    }
    throw new Error('Invalid date format. Expected YYYY-MM-DD, YYYY-MM, or YYYY.');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return { value: dateStr, format: 'YYYY-MM-DD' };
    }
  }
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [year, month] = dateStr.split('-');
    const m = parseInt(month, 10);
    if (m >= 1 && m <= 12) {
      return { value: dateStr, format: 'YYYY-MM' };
    }
  }
  if (/^\d{4}$/.test(dateStr)) {
    return { value: dateStr, format: 'YYYY' };
  }
  throw new Error('Invalid date format. Expected YYYY-MM-DD, YYYY-MM, or YYYY.');
}

/**
 * Slugifies text into a URL-safe directory name.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Resolves the alt text and rich text values for a slide based on option strategies.
 */
export function resolveSlideContent(slide, index, options = {}) {
  const altTextOption = options.altText || 'slide'; // 'index' | 'slide' | 'speaker'
  const textOption = options.text || 'speaker'; // 'slide' | 'speaker'
  const indexText = `Slide ${index + 1}`;

  const notesRich = toRichText(slide.notes);
  const slideTextRich = toRichText(slide.slideText);

  let altVal = '';
  if (altTextOption === 'speaker') {
    altVal = notesRich.text || slideTextRich.text || indexText;
  } else if (altTextOption === 'slide') {
    altVal = slideTextRich.text || indexText;
  } else {
    altVal = indexText;
  }
  altVal = altVal.replace(/\r?\n/g, ' ').trim();

  let richVal = null;
  if (textOption === 'speaker') {
    richVal = notesRich.text ? notesRich : (slideTextRich.text ? slideTextRich : null);
  } else if (textOption === 'slide') {
    richVal = slideTextRich.text ? slideTextRich : (notesRich.text ? notesRich : null);
  }

  return { altVal, richVal };
}

/**
 * Generates the content of index.md.
 */
export function generateMarkdown(title, slides, presentationId, pubDate, options = {}) {
  let md = `# ${title}\n\n`;
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const { altVal, richVal } = resolveSlideContent(slide, i, options);
    const textVal = richVal ? renderMarkdown(richVal) : '';

    md += `![${altVal}](${slide.imagePath})`;
    if (textVal) {
      md += `\n\n${textVal}`;
    }
    md += `\n\n`;
  }
  md += `---\n\n_Original Deck: [docs.google.com/presentation/d/${presentationId}](https://docs.google.com/presentation/d/${presentationId}/edit)_\n\n_Published: ${pubDate}_\n`;
  return md;
}



/**
 * Core scraping logic. Accepts any Playwright Page already loaded with a
 * Google Slides editor. Navigates through slides, extracts content, takes
 * screenshots, and writes output files.
 */
export async function scrapeSlides(page, presentationId, outputDir, options = {}) {
  const pubDateObj = options.pubDateObj || {
    value: options.pubDate || new Date().toISOString().split('T')[0],
    format: 'YYYY-MM-DD'
  };

  const pageTitle = await page.title();
  const title = pageTitle.replace(/ - Google Slides$/, '');
  console.log(`Loaded: "${title}"`);

  const finalOutputDir = outputDir ? outputDir : `${pubDateObj.value}-${slugify(title)}`;
  fs.mkdirSync(finalOutputDir, { recursive: true });
  
  const slides = [];
  const seenSlideIds = new Set();
  
  // Inject browser-side rich text helpers once before scraping
  await page.evaluate(`
    window.getRichText = ${getRichText.toString()};
    window.buildRichText = ${buildRichText.toString()};
    window.detectLinkFacets = ${detectLinkFacets.toString()};
  `);

  while (true) {
    const currentUrl = page.url();
    const slideId = getSlideIdFromUrl(currentUrl);
    
    if (!slideId) {
      // If we don't have slideId in the URL, wait a moment or try to retrieve it
      await page.waitForTimeout(1000);
      const updatedUrl = page.url();
      const updatedSlideId = getSlideIdFromUrl(updatedUrl);
      if (!updatedSlideId) {
        console.log('Could not find slide ID in URL, stopping scrape.');
        break;
      }
      continue;
    }
    
    if (seenSlideIds.has(slideId)) {
      console.log('Reached already seen slide ID, finished scraping.');
      break;
    }
    
    seenSlideIds.add(slideId);
    
    // Extract notes and slide visual text
    // Wait for the slide background element to be attached and visible
    const suffix = slideId.startsWith('id.') ? slideId.substring(3) : slideId;
    const bgSelector = `#workspace-container svg [id$="${suffix}-bg"]`;
    try {
      await page.waitForSelector(bgSelector, { state: 'attached', timeout: 5000 });
      await page.waitForFunction((sel) => {
        const bg = document.querySelector(sel);
        if (!bg) return false;
        const svg = bg.closest('svg');
        if (!svg) return false;
        const r = svg.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && window.getComputedStyle(svg).display !== 'none';
      }, bgSelector, { timeout: 5000 });
    } catch (err) {
      console.warn(`Warning: slide background for ${slideId} did not render within timeout: ${err.message}`);
    }

    // Perform all browser-side text extraction, style overrides, and clipping box math in one go
    const { notes, slideText, clipRect } = await page.evaluate(() => {
      // Find active visible SVG workspace
      const svgs = Array.from(document.querySelectorAll('#workspace-container svg'));
      const svg = svgs.find(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && window.getComputedStyle(el).display !== 'none';
      });

      // 1. Extract speaker notes
      const notesEl = document.getElementById('speakernotes');
      const notes = window.buildRichText(
        notesEl ? Array.from(notesEl.querySelectorAll('[id*="-paragraph-"]')) : [],
        notesEl
      );

      // 2. Extract slide visual text from visible SVG
      const slideText = window.buildRichText(
        svg ? Array.from(svg.querySelectorAll('[id*="-paragraph-"]')) : [],
        svg
      );

      // 3. Hide collaborator highlights, selection outlines, and cursors
      const cursors = document.querySelectorAll('.docs-text-ui-cursor-blink');
      cursors.forEach(el => el.style.setProperty('display', 'none', 'important'));
      
      if (svg) {
        const paths = svg.querySelectorAll('path');
        paths.forEach(path => {
          const strokeOpacity = path.getAttribute('stroke-opacity');
          const stroke = path.getAttribute('stroke');
          if (
            strokeOpacity === '0.6' && 
            stroke && 
            stroke !== 'none' && 
            stroke !== '#000000' && 
            stroke !== '#000' && 
            stroke !== '#ffffff' && 
            stroke !== '#fff' &&
            path.getAttribute('stroke-linecap') === 'butt' &&
            path.getAttribute('stroke-linejoin') === 'round' &&
            path.getAttribute('stroke-miterlimit') === '8' &&
            path.style.opacity
          ) {
            path.style.setProperty('display', 'none', 'important');
          }
        });
      }
      
      const presenceEl = document.querySelectorAll('[class*="presence"], [class*="collaborator"]');
      presenceEl.forEach(el => el.style.setProperty('display', 'none', 'important'));

      // 4. Calculate bounding rect clip coordinates
      let clipRect = null;
      if (svg) {
        const bgGroup = svg.querySelector('[id*="-bg"]');
        if (bgGroup) {
          const bgPath = bgGroup.querySelector('path');
          if (bgPath) {
            const r = bgPath.getBoundingClientRect();
            clipRect = { x: r.x, y: r.y, width: r.width, height: r.height };
          }
        }
      }

      return { notes, slideText, clipRect };
    });

    const imagePath = `slide-${slides.length + 1}.png`;
    const absoluteImagePath = path.join(finalOutputDir, imagePath);
    if (process.stdout.isTTY) {
      process.stdout.write(`\r\x1b[KSaving: slide ${slides.length + 1}`);
    } else {
      console.log(`Saving: slide ${slides.length + 1}`);
    }

    try {
      if (clipRect) {
        await page.screenshot({ path: absoluteImagePath, clip: clipRect });
      } else if (typeof page.locator === 'function') {
        // Fallback: take screenshot of visible SVG
        const svgSelector = '#workspace-container svg:visible';
        const svgElement = page.locator(svgSelector).first();
        await svgElement.screenshot({ path: absoluteImagePath });
      } else {
        await page.screenshot({ path: absoluteImagePath });
      }
    } catch (err) {
      console.error(`Failed to export slide ${slides.length + 1}:`, err.message);
      // Fallback: take screenshot of the entire page
      await page.screenshot({ path: absoluteImagePath });
    }
    
    slides.push({ id: slideId, notes, slideText, imagePath });
    
    if (options.maxSlides && slides.length >= options.maxSlides) {
      console.log(`Reached maxSlides limit of ${options.maxSlides}. Stopping scrape.`);
      break;
    }
    
    // Navigate next
    const prevUrl = currentUrl;
    await page.keyboard.press('PageDown');
    // Wait for the URL to change to a new slide ID (with a timeout).
    // If it doesn't change, we are at the last slide.
    try {
      await page.waitForURL((url) => {
        const newSlideId = getSlideIdFromUrl(url.toString());
        return newSlideId && newSlideId !== slideId;
      }, { timeout: 2000 });
    } catch {
      // If the URL did not change, we have reached the last slide.
      if (page.url() === prevUrl) {
        break;
      }
    }
  }

  if (process.stdout.isTTY) {
    process.stdout.write('\n');
  }
  const format = options.format || 'markdown';
  if (format === 'html') {
    console.log('Saving: index.html');
    const htmlContent = generateHtml(title, slides, presentationId, pubDateObj.value, {
      altText: options.altText,
      text: options.text
    });
    fs.writeFileSync(path.join(finalOutputDir, 'index.html'), htmlContent, 'utf8');
  } else {
    console.log('Saving: index.md');
    const markdownContent = generateMarkdown(title, slides, presentationId, pubDateObj.value, {
      altText: options.altText,
      text: options.text
    });
    fs.writeFileSync(path.join(finalOutputDir, 'index.md'), markdownContent, 'utf8');
  }

  return { title, slidesCount: slides.length, finalOutputDir };
}

/**
 * Launches a browser, navigates to the Google Slides editor, and delegates
 * to scrapeSlides. This is the main entry point for the CLI.
 */
export async function exportSlides(presentationId, outputDir, options = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    const editUrl = `https://docs.google.com/presentation/d/${presentationId}/edit`;
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForSelector('#speakernotes', { timeout: 20000 });
    } catch {
      throw new Error('Failed to load Google Slides editor. Is the presentation public?');
    }

    // Wait for the editor UI to fully settle
    await page.waitForTimeout(3000);

    return await scrapeSlides(page, presentationId, outputDir, options);
  } finally {
    await browser.close();
  }
}

function getSlideIdFromUrl(url) {
  const match = url.match(/slide=id\.([a-zA-Z0-9_]+)/);
  return match ? `id.${match[1]}` : null;
}
