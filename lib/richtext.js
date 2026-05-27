/**
 * Converts a raw string or rich text object to a standardized rich text structure.
 */
export function toRichText(val) {
  if (typeof val === 'string') {
    return { text: val, facets: [] };
  }
  if (val && typeof val === 'object' && typeof val.text === 'string') {
    return { text: val.text, facets: val.facets || [] };
  }
  return { text: '', facets: [] };
}

/**
 * Helper to split text into segments by facet boundaries and collect active facets for each segment.
 */
export function getSegments(richText) {
  const { text, facets } = richText;
  if (!text) return [];
  if (!facets || facets.length === 0) {
    return [{ text, activeFacets: [] }];
  }

  const boundaries = new Set([0, text.length]);
  for (const f of facets) {
    boundaries.add(f.start);
    boundaries.add(f.end);
  }
  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const start = sortedBoundaries[i];
    const end = sortedBoundaries[i + 1];
    const segmentText = text.slice(start, end);
    if (!segmentText) continue;

    const activeFacets = facets.filter(f => f.start <= start && f.end >= end);
    segments.push({ text: segmentText, activeFacets });
  }
  return segments;
}

/**
 * Helper to process segments and apply a formatting function.
 */
function formatSegments(richText, formatter) {
  const segments = getSegments(richText);
  if (segments.length === 0) return '';

  let result = '';
  for (const { text: segmentText, activeFacets } of segments) {
    const hasLink = activeFacets.find(f => f.type === 'link');
    const isBold = activeFacets.some(f => f.type === 'bold');
    const isItalic = activeFacets.some(f => f.type === 'italic');
    
    result += formatter({
      text: segmentText,
      hasLink,
      isBold,
      isItalic
    });
  }
  return result;
}

/**
 * Renders structured rich text (text + facets) back into Markdown formatted text.
 */
export function renderMarkdown(richText) {
  return formatSegments(richText, ({ text, hasLink, isBold, isItalic }) => {
    let formattedText = text;

    if (isBold && isItalic) {
      formattedText = `***${formattedText}***`;
    } else if (isBold) {
      formattedText = `**${formattedText}**`;
    } else if (isItalic) {
      formattedText = `*${formattedText}*`;
    }

    if (hasLink) {
      const uri = hasLink.uri;
      if (uri.toLowerCase().startsWith('mailto:')) {
        const label = formattedText.toLowerCase().includes('mailto:') 
          ? formattedText.replace(/mailto:/i, '') 
          : formattedText;
        formattedText = `[${label}](${uri})`;
      } else {
        formattedText = `[${formattedText}](${uri})`;
      }
    }

    return formattedText;
  });
}

/**
 * Helper that detects URLs and email links and creates facets for them.
 */
export function detectLinkFacets(text) {
  const facets = [];
  if (!text) return facets;
  const regex = /\bhttps?:\/\/[^\s]+|\bmailto:[^\s]+/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let rawUrl = match[0];
    let start = match.index;
    let end = start + rawUrl.length;
    
    let cleanUrl = rawUrl;
    const punctMatch = rawUrl.match(/([.,;:?!)]+)$/);
    if (punctMatch) {
      cleanUrl = rawUrl.slice(0, -punctMatch[1].length);
      end = start + cleanUrl.length;
    }
    
    facets.push({
      start,
      end,
      type: 'link',
      uri: cleanUrl
    });
  }
  return facets;
}

/**
 * Backward compatible linkify helper.
 */
export function linkify(text) {
  if (!text) return '';
  const facets = detectLinkFacets(text);
  return renderMarkdown({ text, facets });
}

/**
 * Browser-side function to recursively extract rich text and DOM facets (bold/italic)
 * from a DOM Node. Should be stringified and evaluated in the page context.
 */
export function getRichText(node) {
  if (!node) return { text: '', facets: [] };
  if (node.nodeType === 3) {
    return { text: node.textContent.trim(), facets: [] };
  }
  if (node.nodeType !== 1 || node.childNodes.length === 0) {
    return { text: '', facets: [] };
  }

  const childResults = Array.from(node.childNodes)
    .map(child => getRichText(child))
    .filter(res => res.text.length > 0);
  
  let text = '';
  const facets = [];
  
  for (const child of childResults) {
    if (text.length > 0) {
      const needsSpace = !/^[.,;:!?)[\]}"'”’]/.test(child.text);
      if (needsSpace) {
        text += ' ';
      }
    }
    const offset = text.length;
    for (const facet of child.facets) {
      facets.push({
        start: facet.start + offset,
        end: facet.end + offset,
        type: facet.type,
        uri: facet.uri
      });
    }
    text += child.text;
  }
  
  if (!text) return { text: '', facets: [] };

  const style = window.getComputedStyle(node);
  const isBold = style.fontWeight === '700' || style.fontWeight === 'bold' || parseInt(style.fontWeight, 10) >= 600;
  const isItalic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';

  if (isBold) {
    facets.push({ start: 0, end: text.length, type: 'bold' });
  }
  if (isItalic) {
    facets.push({ start: 0, end: text.length, type: 'italic' });
  }
  
  return { text, facets };
}

/**
 * Browser-side helper function to build rich text for a list of sibling paragraph/shape elements.
 * Separates blocks with newlines and appends link facets.
 */
export function buildRichText(elements, defaultEl) {
  if (elements && elements.length > 0) {
    let text = '';
    const facets = [];
    
    for (const el of elements) {
      const rich = getRichText(el);
      if (rich.text.length > 0) {
        if (text.length > 0) {
          text += '\n';
        }
        const offset = text.length;
        for (const facet of rich.facets) {
          facets.push({
            start: facet.start + offset,
            end: facet.end + offset,
            type: facet.type,
            uri: facet.uri
          });
        }
        text += rich.text;
      }
    }
    
    const links = window.detectLinkFacets(text);
    return { text, facets: [...facets, ...links] };
  }
  
  const rich = getRichText(defaultEl);
  if (!rich.text) return { text: '', facets: [] };
  const links = window.detectLinkFacets(rich.text);
  return { text: rich.text, facets: [...rich.facets, ...links] };
}

/**
 * Renders structured rich text (text + facets) back into safe HTML formatted text.
 */
export function renderHtml(richText) {
  const { text, facets } = richText;
  if (!text) return '';
  if (!facets || facets.length === 0) {
    return escapeHtml(text);
  }

  return formatSegments(richText, ({ text: segmentText, hasLink, isBold, isItalic }) => {
    let formattedText = escapeHtml(segmentText);

    if (isBold) {
      formattedText = `<strong>${formattedText}</strong>`;
    }
    if (isItalic) {
      formattedText = `<em>${formattedText}</em>`;
    }

    if (hasLink) {
      const uri = hasLink.uri;
      if (uri.toLowerCase().startsWith('mailto:')) {
        const label = formattedText.toLowerCase().includes('mailto:') 
          ? formattedText.replace(/mailto:/i, '') 
          : formattedText;
        formattedText = `<a href="${uri}">${label}</a>`;
      } else {
        formattedText = `<a href="${uri}">${formattedText}</a>`;
      }
    }

    return formattedText;
  });
}

export function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

