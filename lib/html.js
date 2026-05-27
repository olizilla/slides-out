import fs from 'fs';
import { renderHtml, escapeHtml } from './richtext.js';
import { resolveSlideContent } from './exporter.js';

/**
 * Generates the content of index.html.
 */
export function generateHtml(title, slides, presentationId, pubDate, options = {}) {
  const templateUrl = new URL('./template.html', import.meta.url);
  const template = fs.readFileSync(templateUrl, 'utf8');

  let slidesHtml = '';
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const { altVal, richVal } = resolveSlideContent(slide, i, options);
    const textHtml = richVal ? renderHtml(richVal) : '';

    slidesHtml += `  <figure class="slide">\n`;
    slidesHtml += `    <img src="${slide.imagePath}" alt="${escapeHtml(altVal)}">\n`;
    if (textHtml) {
      slidesHtml += `    <figcaption class="notes">${textHtml}</figcaption>\n`;
    }
    slidesHtml += `  </figure>\n`;
  }

  return template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace('{{SLIDES}}', slidesHtml)
    .replaceAll('{{PRESENTATION_ID}}', escapeHtml(presentationId))
    .replace('{{PUB_DATE}}', escapeHtml(pubDate));
}
