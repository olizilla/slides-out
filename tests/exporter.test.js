import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { 
  parsePresentationId, 
  parseDate, 
  slugify, 
  generateMarkdown,
  scrapeSlides,
  exportSlides,
  linkify,
  toRichText,
  renderMarkdown,
  detectLinkFacets,
  renderHtml,
  escapeHtml,
  generateHtml
} from '../lib/exporter.js';

test('parsePresentationId validates and extracts the Google Slides ID', () => {
  const expectedId = '1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg';
  
  // Edit URL
  assert.equal(
    parsePresentationId('https://docs.google.com/presentation/d/1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg/edit?slide=id.g3e1dca384e5_0_20#slide=id.g3e1dca384e5_0_20'),
    expectedId
  );
  
  // Preview URL
  assert.equal(
    parsePresentationId('https://docs.google.com/presentation/d/1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg/preview'),
    expectedId
  );
  
  // Bare presentation ID
  assert.equal(
    parsePresentationId('1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg'),
    expectedId
  );
  
  // Invalid URLs
  assert.throws(() => parsePresentationId('https://google.com'));
  assert.throws(() => parsePresentationId(''));
});

test('parseDate validates date precision and formatting', () => {
  // YYYY-MM-DD
  assert.deepEqual(parseDate('2026-05-25'), { value: '2026-05-25', format: 'YYYY-MM-DD' });
  
  // YYYY-MM
  assert.deepEqual(parseDate('2026-05'), { value: '2026-05', format: 'YYYY-MM' });
  
  // YYYY
  assert.deepEqual(parseDate('2026'), { value: '2026', format: 'YYYY' });

  // Valid ISO Timestamps
  assert.deepEqual(parseDate('2026-05-25T12:00:00Z'), { value: '2026-05-25', format: 'YYYY-MM-DD' });
  assert.deepEqual(parseDate('2026-05-25T12:00:00.000Z'), { value: '2026-05-25', format: 'YYYY-MM-DD' });
  
  // Invalid formats and invalid ISO times
  assert.throws(() => parseDate('2026-05-25T99:99:99Z'));
  assert.throws(() => parseDate('2026-05-25Tinvalid'));
  assert.throws(() => parseDate('2026-05-25xyz'));
  assert.throws(() => parseDate('2026-5-25'));
  assert.throws(() => parseDate('abc'));
  assert.throws(() => parseDate(''));
});

test('slugify converts presentation titles to URL-safe directory names', () => {
  assert.equal(slugify('Digital Interop in the NHS'), 'digital-interop-in-the-nhs');
  assert.equal(slugify('Hello, World! 123 @#$'), 'hello-world-123');
  assert.equal(slugify('---Trim-Me---'), 'trim-me');
});

test('generateMarkdown constructs the correct index.md output', () => {
  const title = 'Digital Interop in the NHS';
  const slides = [
    { id: 'slide1', imagePath: 'slide-1.png', notes: 'First slide speaker notes.' },
    { id: 'slide2', imagePath: 'slide-2.png', notes: 'Second slide speaker notes.' }
  ];
  const presentationId = '12345';
  const pubDate = '2026-05-25';
  
  const markdown = generateMarkdown(title, slides, presentationId, pubDate);
  const expectedMarkdown = fs.readFileSync(new URL('./fixtures/generateMarkdown-expected.md', import.meta.url), 'utf8');
  
  assert.equal(markdown, expectedMarkdown);
});

test('generateMarkdown handles various alt-text and text options and fallbacks', () => {
  const title = 'Test Deck';
  const slides = [
    { id: 's1', imagePath: 's-1.png', notes: 'Speaker note 1', slideText: 'Visual text 1' },
    { id: 's2', imagePath: 's-2.png', notes: '', slideText: 'Visual text 2' },
    { id: 's3', imagePath: 's-3.png', notes: 'Speaker note 3', slideText: '' },
    { id: 's4', imagePath: 's-4.png', notes: '', slideText: '' }
  ];

  // 1. Defaults: --alt-text slide (fallback to index), --text speaker (fallback to slide)
  const mdDefault = generateMarkdown(title, slides, '123', '2026-05-25');
  // Slide 1: alt = 'Visual text 1', text = 'Speaker note 1'
  assert.match(mdDefault, /!\[Visual text 1\]\(s-1\.png\)\n\nSpeaker note 1\n/);
  // Slide 2: alt = 'Visual text 2', text = 'Visual text 2' (notes fallback to slideText)
  assert.match(mdDefault, /!\[Visual text 2\]\(s-2\.png\)\n\nVisual text 2\n/);
  // Slide 3: alt = 'Slide 3' (slideText fallback to index), text = 'Speaker note 3'
  assert.match(mdDefault, /!\[Slide 3\]\(s-3\.png\)\n\nSpeaker note 3\n/);
  // Slide 4: alt = 'Slide 4', text = '' (no text)
  assert.match(mdDefault, /!\[Slide 4\]\(s-4\.png\)\n\n/);

  // 2. --alt-text speaker (fallback to slide, then index), --text slide (fallback to speaker)
  const mdCustom = generateMarkdown(title, slides, '123', '2026-05-25', {
    altText: 'speaker',
    text: 'slide'
  });
  // Slide 1: alt = 'Speaker note 1', text = 'Visual text 1'
  assert.match(mdCustom, /!\[Speaker note 1\]\(s-1\.png\)\n\nVisual text 1\n/);
  // Slide 2: alt = 'Visual text 2' (speaker notes fallback to slideText), text = 'Visual text 2'
  assert.match(mdCustom, /!\[Visual text 2\]\(s-2\.png\)\n\nVisual text 2\n/);
  // Slide 3: alt = 'Speaker note 3', text = 'Speaker note 3' (slideText fallback to speaker notes)
  assert.match(mdCustom, /!\[Speaker note 3\]\(s-3\.png\)\n\nSpeaker note 3\n/);
  // Slide 4: alt = 'Slide 4' (both empty, fallback to index), text = '' (no text)
  assert.match(mdCustom, /!\[Slide 4\]\(s-4\.png\)\n\n/);

  // 3. --alt-text index
  const mdIndex = generateMarkdown(title, slides, '123', '2026-05-25', {
    altText: 'index'
  });
  assert.match(mdIndex, /!\[Slide 1\]\(s-1\.png\)/);
  assert.match(mdIndex, /!\[Slide 2\]\(s-2\.png\)/);
});


test('exportSlides end-to-end integration test', { skip: !process.env.TEST_E2E }, async () => {
  const presentationId = '1p-vwbdQgK_wU4Lzj75cWnt5rxd60FQexiFR76XqP5Mg';
  const tempOutputDir = './test_output_nhs';
  const expectedOutputDir = './test_output_nhs';
  
  // Clean up if exists
  if (fs.existsSync(expectedOutputDir)) {
    fs.rmSync(expectedOutputDir, { recursive: true, force: true });
  }
  
  try {
    const result = await exportSlides(presentationId, tempOutputDir, {
      maxSlides: 2,
      pubDateObj: { value: '2026-05-25', format: 'YYYY-MM-DD' }
    });
    
    assert.equal(result.title, 'Digital Interop in the NHS');
    assert.equal(result.slidesCount, 2);
    assert.equal(result.finalOutputDir, expectedOutputDir);
    
    // Check that files are created
    assert.ok(fs.existsSync(path.join(expectedOutputDir, 'index.md')));
    assert.ok(fs.existsSync(path.join(expectedOutputDir, 'slide-1.png')));
    assert.ok(fs.existsSync(path.join(expectedOutputDir, 'slide-2.png')));

    // Verify screenshot dimensions are exactly 1600x900px
    const slide1Buffer = fs.readFileSync(path.join(expectedOutputDir, 'slide-1.png'));
    const width = slide1Buffer.readUInt32BE(16);
    const height = slide1Buffer.readUInt32BE(20);
    assert.equal(width, 1600);
    assert.equal(height, 900);
    
    // Check markdown content (default alt-text is slide visual text, text is speaker notes)
    const markdown = fs.readFileSync(path.join(expectedOutputDir, 'index.md'), 'utf8');
    assert.match(markdown, /^# Digital Interop in the NHS\n/);
    assert.match(markdown, /!\[🤝 Digital Interoperability In the NHS.*\]\(slide-1\.png\)/);
    assert.match(markdown, /!\[🤝 Digital Interoperability In the NHS.*\]\(slide-2\.png\)/);
    assert.match(markdown, /_Published: 2026-05-25_/);
  } finally {
    // Clean up test output
    if (fs.existsSync(expectedOutputDir)) {
      fs.rmSync(expectedOutputDir, { recursive: true, force: true });
    }
  }
});

test('scrapeSlides preserves newlines in speaker notes', async () => {
  const outputDir = './test_output_mock';
  const expectedOutputDir = './test_output_mock';

  // Cleanup
  if (fs.existsSync(expectedOutputDir)) {
    fs.rmSync(expectedOutputDir, { recursive: true, force: true });
  }

  const mockPage = {
    title: () => Promise.resolve('Mock Presentation'),
    url: () => 'https://docs.google.com/presentation/d/123/edit?slide=id.g123_0_1#slide=id.g123_0_1',
    screenshot: () => Promise.resolve(Buffer.from([])),
    keyboard: {
      press: () => Promise.resolve()
    },
    waitForSelector: () => Promise.resolve(),
    waitForFunction: () => Promise.resolve(),
    waitForURL: () => Promise.resolve(),
    addInitScript: () => Promise.resolve(),
    evaluate: (fn, ...args) => {
      if (fn.toString().includes('speakernotes')) {
        return Promise.resolve({
          notes: 'Line 1\nLine 2\n- Bullet 1',
          slideText: 'Slide Text'
        });
      }
      return Promise.resolve({ x: 10, y: 10, width: 100, height: 100 });
    }
  };

  try {
    const result = await scrapeSlides(mockPage, '123', outputDir, {
      maxSlides: 1,
      pubDateObj: { value: '2026-05-25', format: 'YYYY-MM-DD' }
    });

    assert.equal(result.slidesCount, 1);
    const markdown = fs.readFileSync(path.join(expectedOutputDir, 'index.md'), 'utf8');
    assert.match(markdown, /Line 1\nLine 2\n- Bullet 1/);
  } finally {
    if (fs.existsSync(expectedOutputDir)) {
      fs.rmSync(expectedOutputDir, { recursive: true, force: true });
    }
  }
});

test('linkify converts raw URLs and mailto links to markdown links', () => {
  assert.equal(linkify(''), '');
  assert.equal(linkify('hello world'), 'hello world');
  
  // HTTP/HTTPS URLs
  assert.equal(
    linkify('Visit https://example.com/path for details.'),
    'Visit [https://example.com/path](https://example.com/path) for details.'
  );
  
  // Mailto links
  assert.equal(
    linkify('Contact mailto:oli@zilla.org.uk!'),
    'Contact [oli@zilla.org.uk](mailto:oli@zilla.org.uk)!'
  );
  
  // Multiple links and complex punctuation
  assert.equal(
    linkify('Check http://example.com, or mailto:test@example.com.'),
    'Check [http://example.com](http://example.com), or [test@example.com](mailto:test@example.com).'
  );
});

test('rich text facets parse and render formatting correctly', () => {
  // Test plain text conversion
  assert.deepEqual(toRichText('hello'), { text: 'hello', facets: [] });
  assert.deepEqual(toRichText({ text: 'world', facets: [{ start: 0, end: 5, type: 'bold' }] }), {
    text: 'world',
    facets: [{ start: 0, end: 5, type: 'bold' }]
  });

  // Test detectLinkFacets
  const linkText = 'Go to https://example.com and mailto:oli@zilla.org.uk!';
  const linkFacets = detectLinkFacets(linkText);
  assert.equal(linkFacets.length, 2);
  assert.deepEqual(linkFacets[0], { start: 6, end: 25, type: 'link', uri: 'https://example.com' });
  assert.deepEqual(linkFacets[1], { start: 30, end: 53, type: 'link', uri: 'mailto:oli@zilla.org.uk' });

  // Test rendering nested/overlapping facets
  const rich = {
    text: 'Hello world link here',
    facets: [
      { start: 0, end: 5, type: 'bold' },
      { start: 6, end: 16, type: 'italic' },
      { start: 12, end: 21, type: 'link', uri: 'https://example.com' }
    ]
  };

  // 'Hello' -> bold -> **Hello**
  // ' ' -> plain -> ' '
  // 'world ' -> italic -> *world *
  // 'link' -> italic + link -> *[link](https://example.com)*
  // ' here' -> link -> [ here](https://example.com)
  const rendered = renderMarkdown(rich);
  assert.equal(rendered, '**Hello** *world *[*link*](https://example.com)[ here](https://example.com)');

  // Regression check for sibling facet offset bug:
  // Sibling 1 (plain): 'interface'
  // Sibling 2 (bold): '- and show that it works'
  const sib1 = { text: 'interface', facets: [] };
  const sib2 = { text: '- and show that it works', facets: [{ start: 0, end: 24, type: 'bold' }] };

  let combinedText = '';
  const combinedFacets = [];
  for (const child of [sib1, sib2]) {
    if (combinedText.length > 0) {
      combinedText += ' ';
    }
    const offset = combinedText.length;
    for (const facet of child.facets) {
      combinedFacets.push({
        start: facet.start + offset,
        end: facet.end + offset,
        type: facet.type
      });
    }
    combinedText += child.text;
  }

  assert.equal(combinedText, 'interface - and show that it works');
  assert.deepEqual(combinedFacets, [{ start: 10, end: 34, type: 'bold' }]);
  assert.equal(
    renderMarkdown({ text: combinedText, facets: combinedFacets }),
    'interface **- and show that it works**'
  );
  assert.equal(
    renderHtml({ text: combinedText, facets: combinedFacets }),
    'interface <strong>- and show that it works</strong>'
  );

  // Test punctuation spacing regression (no space before comma/period/quotes/brackets)
  const runSpacingTest = (p1, p2, p3) => {
    let testText = '';
    const testFacets = [];
    for (const child of [p1, p2, p3]) {
      if (testText.length > 0) {
        const needsSpace = !/^[.,;:!?)[\]}"'”’]/.test(child.text);
        if (needsSpace) {
          testText += ' ';
        }
      }
      const offset = testText.length;
      for (const facet of child.facets) {
        testFacets.push({
          start: facet.start + offset,
          end: facet.end + offset,
          type: facet.type
        });
      }
      testText += child.text;
    }
    return { text: testText, facets: testFacets };
  };

  const part1 = { text: 'works', facets: [{ start: 0, end: 5, type: 'bold' }] };
  const part2 = { text: ',', facets: [] };
  const part3 = { text: 'indeed', facets: [] };
  const resComma = runSpacingTest(part1, part2, part3);
  assert.equal(resComma.text, 'works, indeed');
  assert.equal(renderMarkdown(resComma), '**works**, indeed');
  assert.equal(renderHtml(resComma), '<strong>works</strong>, indeed');

  const partQuote = { text: '”', facets: [] };
  const resQuote = runSpacingTest(part1, partQuote, part3);
  assert.equal(resQuote.text, 'works” indeed');
  assert.equal(renderMarkdown(resQuote), '**works**” indeed');
  assert.equal(renderHtml(resQuote), '<strong>works</strong>” indeed');
});

test('renderHtml, escapeHtml, and generateHtml output format verification', () => {
  // Test escapeHtml
  assert.equal(escapeHtml('Hello <world> & "friends"'), 'Hello &lt;world&gt; &amp; &quot;friends&quot;');

  // Test renderHtml
  const rich = {
    text: 'Hello world link here',
    facets: [
      { start: 0, end: 5, type: 'bold' },
      { start: 6, end: 16, type: 'italic' },
      { start: 12, end: 21, type: 'link', uri: 'https://example.com' }
    ]
  };
  const rendered = renderHtml(rich);
  assert.equal(
    rendered,
    '<strong>Hello</strong> <em>world </em><a href="https://example.com"><em>link</em></a><a href="https://example.com"> here</a>'
  );

  // Test generateHtml structure
  const title = 'Test Slides';
  const slides = [{ id: 's1', imagePath: 's-1.png', notes: 'Note 1', slideText: '' }];
  const html = generateHtml(title, slides, '123', '2026-05-25', { altText: 'speaker' });
  const expectedHtml = fs.readFileSync(new URL('./fixtures/generateHtml-expected.html', import.meta.url), 'utf8');
  
  assert.equal(html, expectedHtml);
});

test('scrapeSlides with format html option writes index.html', async () => {
  const outputDir = './test_output_html';
  const expectedOutputDir = './test_output_html';

  if (fs.existsSync(expectedOutputDir)) {
    fs.rmSync(expectedOutputDir, { recursive: true, force: true });
  }

  const mockPage = {
    title: () => Promise.resolve('Mock Presentation'),
    url: () => 'https://docs.google.com/presentation/d/123/edit?slide=id.g123_0_1#slide=id.g123_0_1',
    screenshot: () => Promise.resolve(Buffer.from([])),
    keyboard: {
      press: () => Promise.resolve()
    },
    waitForSelector: () => Promise.resolve(),
    waitForFunction: () => Promise.resolve(),
    waitForURL: () => Promise.resolve(),
    addInitScript: () => Promise.resolve(),
    evaluate: (fn, ...args) => {
      if (fn.toString().includes('speakernotes')) {
        return Promise.resolve({
          notes: 'Speaker Note 1',
          slideText: 'Slide Text'
        });
      }
      return Promise.resolve({ x: 10, y: 10, width: 100, height: 100 });
    }
  };

  try {
    const result = await scrapeSlides(mockPage, '123', outputDir, {
      maxSlides: 1,
      format: 'html',
      pubDateObj: { value: '2026-05-25', format: 'YYYY-MM-DD' }
    });

    assert.equal(result.slidesCount, 1);
    assert.ok(fs.existsSync(path.join(expectedOutputDir, 'index.html')));
    assert.ok(!fs.existsSync(path.join(expectedOutputDir, 'index.md')));

    const html = fs.readFileSync(path.join(expectedOutputDir, 'index.html'), 'utf8');
    assert.match(html, /Speaker Note 1/);
  } finally {
    if (fs.existsSync(expectedOutputDir)) {
      fs.rmSync(expectedOutputDir, { recursive: true, force: true });
    }
  }
});




