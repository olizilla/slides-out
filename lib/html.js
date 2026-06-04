import { renderHtml } from './richtext.js';
import { resolveSlideContent } from './exporter.js';
import { launchBrowser } from './browser.js';

/**
 * Generates the content of index.html.
 */
export async function generateHtml(page, title, slides, presentationId, pubDate, options = {}) {
  if (typeof page === 'string') {
    options = pubDate || {};
    pubDate = presentationId;
    presentationId = slides;
    slides = title;
    title = page;
    page = null;
  }

  const templateUrl = new URL('./html.html', import.meta.url);

  let browser = null;
  if (!page || typeof page.setContent !== 'function') {
    browser = await launchBrowser();
    page = await browser.newPage();
  }

  try {
    await page.goto(templateUrl.toString());
    const resolvedSlides = slides.map((slide, i) => {
      const { altVal, richVal } = resolveSlideContent(slide, i, options);
      return {
        id: slide.id || '',
        imagePath: slide.imagePath,
        alt: altVal,
        notesHtml: richVal ? renderHtml(richVal) : ''
      };
    });

    await page.evaluate(renderPresentation, {
      title,
      slides: resolvedSlides,
      presentationId,
      pubDate
    });

    return await page.content();
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Performs DOM rendering of the presentation.
 * This function is evaluated in the browser context!
 */
function renderPresentation({ title, slides, presentationId, pubDate }) {
  document.title = title;
  const titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.textContent = title;
  }

  const linkEl = document.getElementById('deck-link');
  if (linkEl) {
    linkEl.href = `https://docs.google.com/presentation/d/${presentationId}/edit`;
    linkEl.textContent = `docs.google.com/presentation/d/${presentationId}`;
  }

  const pubDateEl = document.getElementById('pub-date');
  if (pubDateEl) {
    pubDateEl.textContent = pubDate;
  }

  const templateEl = document.getElementById('slide-template');
  if (templateEl) {
    const parent = templateEl.parentNode;
    for (let i = 0; i < slides.length; i++) {
      const clone = templateEl.content.cloneNode(true);
      const slideId = `slide-${i + 1}`;
      const data = slides[i];

      const slide = clone.querySelector('.slide');
      if (slide) {
        slide.id = slideId;
      }

      const link = clone.querySelector('.slide-link');
      if (link) {
        link.href = `#${slideId}`;
      }

      const img = clone.querySelector('.slide-img');
      if (img) {
        img.src = data.imagePath;
        img.alt = data.alt;
      }

      const notes = clone.querySelector('.slide-notes');
      if (notes) {
        if (data.notesHtml) {
          notes.innerHTML = data.notesHtml;
        } else {
          notes.remove();
        }
      }

      parent.insertBefore(clone, templateEl);
    }
    templateEl.remove();
  }
}