const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, PageBreak
} = require('docx');
const fs = require('fs');

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  navy:    '1A1A2E',
  teal:    '048A81',
  tealLt:  'D6F0EE',
  amber:   'D97706',
  amberLt: 'FEF3C7',
  red:     'B91C1C',
  redLt:   'FEE2E2',
  green:   '15803D',
  greenLt: 'DCFCE7',
  purple:  '6D28D9',
  purpleLt:'EDE9FE',
  gray:    '374151',
  grayLt:  'F3F4F6',
  grayMid: 'D1D5DB',
  muted:   '6B7280',
  white:   'FFFFFF',
  text:    '111827',
  rowAlt:  'F9FAFB',
};

const bdr = (color = C.grayMid) => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color = C.grayMid) => ({ top: bdr(color), bottom: bdr(color), left: bdr(color), right: bdr(color) });
const noBorder = () => ({ style: BorderStyle.NONE, size: 0, color: C.white });
const noBorders = () => ({ top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() });

// ── PRIMITIVE BUILDERS ────────────────────────────────────────────────────────
function gap(before = 60, after = 60) {
  return new Paragraph({ spacing: { before, after }, children: [new TextRun('')] });
}

function rule(color = C.teal) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color, space: 1 } },
    spacing: { before: 60, after: 80 },
    children: []
  });
}

function h1(text) {
  return [
    gap(400, 0),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text, font: 'Arial', size: 34, bold: true, color: C.navy })]
    }),
    rule()
  ];
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 26, bold: true, color: C.teal })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, font: 'Arial', size: 22, bold: true, color: C.gray })]
  });
}

function p(runs) {
  const runArr = typeof runs === 'string'
    ? [new TextRun({ text: runs, font: 'Arial', size: 20, color: C.text })]
    : runs.map(r =>
        typeof r === 'string'
          ? new TextRun({ text: r, font: 'Arial', size: 20, color: C.text })
          : new TextRun({ font: 'Arial', size: 20, color: C.text, ...r })
      );
  return new Paragraph({ spacing: { before: 40, after: 80 }, children: runArr });
}

function mono(text, opts = {}) {
  return new TextRun({ text, font: 'Courier New', size: 18, color: opts.color || C.navy, bold: opts.bold || false });
}

function pill(text, bg, fg) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({
      text: `  ${text}  `,
      font: 'Arial', size: 17, bold: true, color: fg,
      shading: { fill: bg, type: ShadingType.CLEAR }
    })]
  });
}

function b(level = 0) {
  return { reference: level === 0 ? 'bullets' : 'sub-bullets', level: 0 };
}

function li(text, level = 0, opts = {}) {
  const runText = typeof text === 'string'
    ? [new TextRun({ text, font: 'Arial', size: 20, color: opts.color || C.text, bold: opts.bold || false })]
    : text;
  return new Paragraph({
    numbering: { reference: level === 0 ? 'bullets' : 'sub-bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: runText
  });
}

function codeblock(lines) {
  const linesArr = Array.isArray(lines) ? lines : [lines];
  return [
    new Paragraph({
      spacing: { before: 80, after: 0 },
      shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
      indent: { left: 360, right: 360 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.teal } },
      children: []
    }),
    ...linesArr.map((line, i) => new Paragraph({
      spacing: { before: 0, after: i === linesArr.length - 1 ? 80 : 0 },
      shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
      indent: { left: 360, right: 360 },
      border: {
        left: { style: BorderStyle.SINGLE, size: 12, color: C.teal },
        bottom: i === linesArr.length - 1 ? { style: BorderStyle.SINGLE, size: 1, color: C.grayMid } : undefined
      },
      children: [new TextRun({ text: line, font: 'Courier New', size: 17, color: C.navy })]
    }))
  ];
}

function callout(label, text, bg, fg, borderColor) {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 16, color: borderColor, space: 1 } },
    shading: { fill: bg, type: ShadingType.CLEAR },
    children: [
      new TextRun({ text: `${label}: `, font: 'Arial', size: 19, bold: true, color: fg }),
      new TextRun({ text, font: 'Arial', size: 19, color: C.gray })
    ]
  });
}

function tbl(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          borders: borders(C.navy),
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: C.navy, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 160, right: 160 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            children: [new TextRun({ text: h, font: 'Arial', size: 18, bold: true, color: C.white })]
          })]
        }))
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => {
          const isObj = typeof cell === 'object' && cell !== null;
          const txt = isObj ? cell.text : cell;
          const isMono = isObj && cell.mono;
          const bold = isObj && cell.bold === true;
          const color = isObj && cell.color ? cell.color : C.text;
          const bg = isObj && cell.bg ? cell.bg : (ri % 2 === 0 ? C.white : C.rowAlt);
          return new TableCell({
            borders: borders(),
            width: { size: colWidths[ci], type: WidthType.DXA },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new TextRun({
                text: txt, font: isMono ? 'Courier New' : 'Arial',
                size: isMono ? 17 : 18, bold, color
              })]
            })]
          });
        })
      }))
    ]
  });
}

// ── TRADEOFF BOX ──────────────────────────────────────────────────────────────
function tradeoff(removed, why, impact) {
  return [
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [3120, 3120, 3120],
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            { label: '🗑 Removed', bg: C.redLt, fg: C.red },
            { label: '💡 Why', bg: C.amberLt, fg: C.amber },
            { label: '📉 Impact', bg: C.grayLt, fg: C.gray }
          ].map(({ label, bg, fg }) => new TableCell({
            borders: borders(C.grayMid),
            width: { size: 3120, type: WidthType.DXA },
            shading: { fill: bg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: label, font: 'Arial', size: 17, bold: true, color: fg })] })]
          }))
        }),
        new TableRow({
          children: [removed, why, impact].map(text => new TableCell({
            borders: borders(),
            width: { size: 3120, type: WidthType.DXA },
            shading: { fill: C.white, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text, font: 'Arial', size: 18, color: C.text })] })]
          }))
        })
      ]
    }),
    gap(60, 80)
  ];
}

// ── DOCUMENT ─────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { font: 'Arial', color: C.teal } }
        }]
      },
      {
        reference: 'sub-bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 900, hanging: 270 } }, run: { font: 'Arial', color: C.muted } }
        }]
      },
      {
        reference: 'numbered',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { font: 'Arial', color: C.teal } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: 'Arial', color: C.navy },
        paragraph: { spacing: { before: 400, after: 60 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: C.teal },
        paragraph: { spacing: { before: 300, after: 80 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Arial', color: C.gray },
        paragraph: { spacing: { before: 200, after: 60 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [

      // ── COVER PAGE ──────────────────────────────────────────────────────────
      gap(1440, 0),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: 'PriceScope', font: 'Arial', size: 80, bold: true, color: C.navy })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'MVP Architecture — Free-Tier Buildable Version', font: 'Arial', size: 28, color: C.teal })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: 'A single-developer, zero-cost, demo-ready price comparison system', font: 'Arial', size: 21, color: C.muted })]
      }),
      gap(0, 60),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.grayMid }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.grayMid } },
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: 'Solo Developer  ·  Free Infrastructure  ·  Portfolio-Ready  ·  Technically Sound', font: 'Arial', size: 19, color: C.muted })]
      }),
      gap(0, 2400),
      new Paragraph({ children: [new PageBreak()] }),

      // ── SECTION 0: NORTH STAR ───────────────────────────────────────────────
      ...h1('0. North Star — What We Are Building'),
      gap(0, 40),
      p([
        { text: 'PriceScope ', bold: true },
        'is a browser extension that detects the product a user is currently viewing (on Amazon, Flipkart, Myntra, etc.), looks it up across other Indian platforms, and instantly shows the cheapest price — along with real price history and a watchlist with drop alerts.'
      ]),
      gap(0, 20),
      p('The MVP must complete this full loop with real data, zero paid infrastructure, and code a single college student can write, understand, and demo.'),
      gap(0, 40),

      tbl(
        ['Principle', 'What it means for this MVP'],
        [
          ['Real data only', 'No synthetic prices. Every price shown was actually observed by the system.'],
          ['Accuracy over coverage', 'Better to show 3 confident matches than 10 uncertain ones.'],
          ['User trust first', 'Label every result with a confidence level and data freshness timestamp.'],
          ['Graceful degradation', 'If a platform scrape fails, show stale data with a timestamp — never fabricate.'],
          ['Buildable in 6–8 weeks', 'No component requires knowledge beyond a solid Node.js + SQL foundation.'],
        ],
        [2800, 6560]
      ),

      // ── SECTION 1: SIMPLIFIED ARCHITECTURE ──────────────────────────────────
      ...h1('1. Simplified System Architecture'),

      h2('1.1 The One-Sentence Architecture'),
      p('A Node.js monolith with a PostgreSQL database, a cron job for background scraping, and a browser extension as the frontend — deployed free on Render.com.'),
      gap(0, 40),

      h2('1.2 Component Map'),
      gap(0, 40),
      tbl(
        ['Component', 'Technology', 'Responsibility', 'Where it lives'],
        [
          ['Browser Extension', 'Vanilla JS, Manifest V3', 'Extract product signals from DOM, call backend, render comparison UI', 'User\'s browser (unpacked or Chrome Web Store)'],
          ['Backend API', 'Node.js + Express', 'Resolve product identity, query DB, return comparison payload', 'Render.com free tier (single process)'],
          ['Database', 'PostgreSQL (Neon.tech free tier)', 'Store products, listings, prices, watchlists, alerts', 'Neon.tech (serverless Postgres, free 512 MB)'],
          ['Background Scraper', 'node-cron + Playwright', 'Periodically re-fetch prices for tracked listings', 'Same Render.com process (single dyno)'],
          ['Auth', 'JWT (jsonwebtoken)', 'Identify users, protect watchlist endpoints', 'In-process middleware'],
          ['Email Alerts', 'Resend.com free tier', 'Send price drop emails (100 emails/day free)', 'Called from backend on price drop detection'],
        ],
        [1600, 1900, 3200, 2660]
      ),
      gap(0, 60),

      callout('Why a monolith', 'Microservices add deployment complexity, inter-service networking, and operational overhead that buys nothing at MVP scale. A single Express app is easier to debug, deploy, and understand.', C.tealLt, C.teal, C.teal),
      gap(60, 40),

      h2('1.3 What Is Intentionally Not Here'),
      gap(0, 20),
      tbl(
        ['Removed', 'Replacement in MVP'],
        [
          ['Redis / BullMQ job queue', 'node-cron inside the same Node process'],
          ['TimescaleDB / pgvector', 'Plain Postgres with a simple price_history table'],
          ['Residential proxy network', 'Direct scraping with polite delays + Playwright stealth mode'],
          ['Distributed scraper workers', 'Single cron function scraping one listing at a time'],
          ['S3 object store', 'Store image URLs as strings, not images themselves'],
          ['Multi-process PM2 cluster', 'Single Render.com web service process'],
          ['Amazon PA-API / Flipkart API', 'Playwright-based DOM scraping (no API key needed)'],
          ['Visual ML matching', 'Model number + title token matching only'],
          ['FCM push notifications', 'Email via Resend.com (simpler, free, no mobile app needed)'],
        ],
        [3200, 6160]
      ),

      // ── SECTION 2: DATA FLOW ─────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('2. End-to-End Data Flow'),

      h2('2.1 Happy Path — Product Already in Database'),
      gap(0, 20),
      tbl(
        ['Step', 'Actor', 'Action', 'Time'],
        [
          ['1', 'Extension (content script)', 'User opens amazon.in product page. Script extracts: title, brand, model number (regex), current price, ASIN, URL', '~0ms'],
          ['2', 'Extension', 'POST /api/compare with extracted payload', '~0ms'],
          ['3', 'Backend: Auth middleware', 'Verify JWT from extension storage. Attach user_id to request.', '~5ms'],
          ['4', 'Backend: Product Resolver', 'Hash the model number or ASIN. Query products table for a match.', '~20ms'],
          ['5', 'Backend: Listing Fetcher', 'JOIN listings + latest price_history for all platforms linked to this product.', '~30ms'],
          ['6', 'Backend: Response Assembler', 'Rank by price. Attach confidence labels. Attach price history arrays. Check user watchlist.', '~10ms'],
          ['7', 'Extension (popup UI)', 'Render comparison panel: cheapest price highlighted, history sparkline, watchlist toggle.', '~50ms'],
          ['Total', '—', '—', '~115ms'],
        ],
        [500, 2000, 4500, 1360]
      ),
      gap(0, 60),

      h2('2.2 Cold Path — Product Not in Database (First Seen)'),
      gap(0, 20),
      tbl(
        ['Step', 'Action'],
        [
          ['1', 'Same extraction as above. POST /api/compare.'],
          ['2', 'Resolver finds no match in products table.'],
          ['3', 'Backend immediately returns: { status: "queued", message: "Tracking started — check back in ~2 minutes" }'],
          ['4', 'Simultaneously: backend inserts a pending scrape_job row into the DB.'],
          ['5', 'Extension shows a "Tracking started" state in popup — no empty state, no error.'],
          ['6', 'Cron job (runs every 2 minutes) picks up pending scrape_jobs.'],
          ['7', 'Scraper fetches the product\'s URL on each target platform, extracts data, stores in products + listings + price_history.'],
          ['8', 'Next time user opens the same product page (or clicks refresh in popup): full comparison is returned.'],
        ],
        [500, 8860]
      ),
      gap(0, 60),
      callout('Design note', 'Never block the user request on live scraping. The cold path is asynchronous — the user gets immediate feedback, and data arrives within minutes via the background job.', C.amberLt, C.amber, C.amber),

      // ── SECTION 3: MATCHING STRATEGY ────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('3. Matching Strategy (Simplified Two-Layer)'),

      h2('3.1 Layer 1 — Deterministic (Hard Identifier)'),
      p('Applied first. If any of these identifiers are found, the match is treated as exact.'),
      gap(0, 20),
      tbl(
        ['Identifier', 'How extracted', 'Where found', 'Confidence'],
        [
          ['Model number', 'Regex against title + spec table text', 'Electronics: always present in spec section', { text: 'Exact (1.00)', bold: true, color: C.green }],
          ['ASIN (Amazon)', 'Parsed from URL: /dp/{ASIN}/', 'Amazon URLs universally', { text: 'Exact (1.00)', bold: true, color: C.green }],
          ['Flipkart PID', 'Parsed from URL: /p/itm{PID}', 'Flipkart URLs universally', { text: 'Exact (1.00)', bold: true, color: C.green }],
          ['ISBN', 'From product page meta or spec table', 'Books only', { text: 'Exact (1.00)', bold: true, color: C.green }],
          ['EAN / barcode', 'From spec table if present', 'Some electronics, FMCG', { text: 'Exact (1.00)', bold: true, color: C.green }],
        ],
        [1500, 2500, 2800, 2560]
      ),
      gap(0, 60),

      h2('3.2 Layer 2 — Probabilistic Token Matching'),
      p('Used when no hard identifier is found (fashion, home goods, generics).'),
      gap(0, 20),
      tbl(
        ['Step', 'Method', 'Detail'],
        [
          ['Tokenize', 'Split title into lowercase tokens', 'Remove stop words: "the", "best", "new", "with", "for", "and"'],
          ['Weight tokens', 'Assign importance scores', 'Brand token: weight 3.0 · Model token: weight 2.5 · Color/size: weight 1.5 · Generic: weight 1.0'],
          ['Compare', 'Jaccard similarity on weighted token sets', 'score = (weighted intersection) / (weighted union)'],
          ['Normalize', 'Attribute cross-check', 'If brand extracted from both sides: must match exactly or score → 0'],
          ['Threshold', 'Score ≥ 0.75 → Likely Match · Score < 0.75 → Rejected', 'Never show a result below 0.75 to the user'],
        ],
        [1200, 2400, 5760]
      ),
      gap(0, 40),
      ...codeblock([
        '// Simplified scoring — implementable in ~40 lines of JS',
        'function matchScore(titleA, titleB, brandA, brandB) {',
        '  if (brandA && brandB && normalize(brandA) !== normalize(brandB)) return 0;',
        '  const tokensA = tokenize(titleA);  // strip stop words, lowercase',
        '  const tokensB = tokenize(titleB);',
        '  const intersection = tokensA.filter(t => tokensB.includes(t));',
        '  const union = [...new Set([...tokensA, ...tokensB])];',
        '  return intersection.length / union.length;  // 0.0 – 1.0',
        '}',
      ]),
      gap(0, 60),

      callout('Visual matching removed', 'Image-based ML matching requires model inference infrastructure not available for free. The two-layer approach above handles electronics and most fashion accurately via title + attribute matching.', C.redLt, C.red, C.red),

      // ── SECTION 4: DATA INGESTION ────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('4. Data Ingestion Strategy (Free Version)'),

      h2('4.1 Scraping Approach'),
      gap(0, 20),
      tbl(
        ['Platform', 'Method', 'Key data points', 'Rate limit strategy'],
        [
          ['Amazon.in', 'Playwright (headless Chromium)', 'Title, price, availability, ASIN, specs', '1 req / 8–15 sec, random UA'],
          ['Flipkart', 'Playwright (headless Chromium)', 'Title, price, availability, PID, specs', '1 req / 8–15 sec, random UA'],
          ['Myntra', 'Playwright (headless Chromium)', 'Title, price, MRP, brand, style ID', '1 req / 10–20 sec'],
          ['Ajio', 'Playwright (headless Chromium)', 'Title, price, brand, product code', '1 req / 10–20 sec'],
          ['Croma', 'Cheerio (static HTML fetch)', 'Title, price, model number', '1 req / 5 sec'],
          ['Blinkit / Zepto', 'Playwright (SPAs)', 'Item name, price, unit, availability', '1 req / 15 sec'],
        ],
        [1400, 2000, 2800, 3160]
      ),
      gap(0, 60),

      h2('4.2 Extension-Assisted Data Collection (Key Free-Tier Advantage)'),
      p('When a user visits a product page and the extension is active, the content script reads the fully-rendered DOM — bypassing anti-bot measures entirely, because this is a real user\'s browser session.'),
      gap(0, 20),
      li('The extension extracts product data from the page the user is already viewing'),
      li('This data is sent to the backend as part of every /api/compare call'),
      li('Backend stores it as a fresh listing observation — even if comparison scraping has not run yet'),
      li('Over time, your catalog builds itself through real user activity'),
      gap(0, 40),
      callout('This is your unfair advantage', 'Production scrapers get blocked. Your extension reads real pages in real browsers for free — and users don\'t even notice.', C.greenLt, C.green, C.green),
      gap(0, 40),

      h2('4.3 Manual Seeding (Week 1 Bootstrap)'),
      p('For the initial demo, manually seed the database with 20–50 popular products across 3 categories (smartphones, headphones, sneakers). This ensures the demo always has data to show.'),
      gap(0, 20),
      li('Write a seed script: scripts/seed.js'),
      li('Run it once against your Neon.tech Postgres instance'),
      li('Scrapers will keep the seeded data fresh automatically'),

      // ── SECTION 5: DATABASE DESIGN ───────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('5. Database Design (Plain PostgreSQL)'),

      h2('5.1 Schema'),
      gap(0, 40),
      ...codeblock([
        '-- Products: one row per unique real-world product',
        'CREATE TABLE products (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  canonical_name TEXT NOT NULL,',
        '  brand        TEXT,',
        '  category     TEXT NOT NULL,  -- electronics | fashion | grocery | ...',
        '  model_number TEXT,',
        '  ean          TEXT,',
        '  isbn         TEXT,',
        '  attributes   JSONB,          -- { color, storage, size, material, ... }',
        '  created_at   TIMESTAMPTZ DEFAULT NOW()',
        ');',
        '',
        '-- Listings: one row per product-platform pair',
        'CREATE TABLE listings (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  product_id   UUID REFERENCES products(id),',
        '  platform     TEXT NOT NULL,  -- amazon | flipkart | myntra | ...',
        '  url          TEXT NOT NULL UNIQUE,',
        '  platform_pid TEXT,           -- ASIN, Flipkart PID, style ID, etc.',
        '  current_price NUMERIC(10,2),',
        '  currency     TEXT DEFAULT \'INR\',',
        '  availability TEXT DEFAULT \'unknown\',',
        '  match_confidence NUMERIC(3,2),',
        '  match_method TEXT,           -- deterministic | probabilistic',
        '  last_scraped_at TIMESTAMPTZ,',
        '  created_at   TIMESTAMPTZ DEFAULT NOW()',
        ');',
        '',
        '-- Price history: append-only, one row per observation',
        'CREATE TABLE price_history (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  listing_id   UUID REFERENCES listings(id),',
        '  price        NUMERIC(10,2) NOT NULL,',
        '  availability TEXT,',
        '  scraped_at   TIMESTAMPTZ DEFAULT NOW()',
        ');',
        '',
        '-- Users',
        'CREATE TABLE users (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  email        TEXT UNIQUE NOT NULL,',
        '  password_hash TEXT NOT NULL,',
        '  created_at   TIMESTAMPTZ DEFAULT NOW()',
        ');',
        '',
        '-- Watchlist',
        'CREATE TABLE watchlist (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  user_id      UUID REFERENCES users(id),',
        '  product_id   UUID REFERENCES products(id),',
        '  target_price NUMERIC(10,2),  -- NULL = alert on any drop',
        '  created_at   TIMESTAMPTZ DEFAULT NOW(),',
        '  UNIQUE(user_id, product_id)',
        ');',
        '',
        '-- Scrape jobs queue (simple table-as-queue)',
        'CREATE TABLE scrape_jobs (',
        '  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),',
        '  listing_url  TEXT NOT NULL,',
        '  platform     TEXT NOT NULL,',
        '  status       TEXT DEFAULT \'pending\',  -- pending | running | done | failed',
        '  priority     INTEGER DEFAULT 5,        -- 1 = highest (watchlisted)',
        '  attempts     INTEGER DEFAULT 0,',
        '  last_error   TEXT,',
        '  created_at   TIMESTAMPTZ DEFAULT NOW(),',
        '  run_after    TIMESTAMPTZ DEFAULT NOW()',
        ');',
      ]),
      gap(0, 40),

      h2('5.2 Essential Indexes'),
      gap(0, 20),
      ...codeblock([
        'CREATE INDEX idx_listings_product ON listings(product_id);',
        'CREATE INDEX idx_listings_platform ON listings(platform);',
        'CREATE INDEX idx_listings_pid ON listings(platform_pid);',
        'CREATE INDEX idx_price_history_listing ON price_history(listing_id, scraped_at DESC);',
        'CREATE INDEX idx_products_model ON products(model_number);',
        'CREATE INDEX idx_products_ean ON products(ean);',
        'CREATE INDEX idx_watchlist_user ON watchlist(user_id);',
        'CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status, priority, run_after);',
      ]),
      gap(0, 40),

      h2('5.3 Price History — Simple but Real'),
      p('No TimescaleDB. Standard Postgres handles 1 million rows in price_history efficiently with the index above. At 1 scrape per listing per 4 hours across 5000 listings, that\'s ~30,000 rows/day — Postgres handles this trivially.'),
      gap(0, 20),
      callout('Retention', 'Add a weekly cleanup job: DELETE FROM price_history WHERE scraped_at < NOW() - INTERVAL \'180 days\'. No partitioning needed at MVP scale.', C.grayLt, C.gray, C.gray),

      // ── SECTION 6: BACKGROUND PROCESSING ────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('6. Background Processing (Simplified)'),

      h2('6.1 The Table-as-Queue Pattern'),
      p('Instead of Redis + BullMQ, use the scrape_jobs table as a lightweight job queue. This is a proven pattern used in production by many teams — simple, transactional, and requires zero extra infrastructure.'),
      gap(0, 40),
      ...codeblock([
        '// Worker loop — runs inside node-cron every 2 minutes',
        'async function processScrapeJobs() {',
        '  // Claim one job atomically (prevents double-processing)',
        '  const job = await db.query(`',
        '    UPDATE scrape_jobs',
        '    SET status = \'running\', attempts = attempts + 1',
        '    WHERE id = (SELECT id FROM scrape_jobs',
        '                WHERE status = \'pending\'',
        '                AND run_after <= NOW()',
        '                ORDER BY priority ASC, created_at ASC',
        '                LIMIT 1',
        '                FOR UPDATE SKIP LOCKED)',
        '    RETURNING *',
        '  `);',
        '  if (!job.rows[0]) return;  // no jobs pending',
        '',
        '  try {',
        '    const data = await scrapeWithPlaywright(job.rows[0]);',
        '    await upsertListingAndPrice(data);',
        '    await db.query("UPDATE scrape_jobs SET status=\'done\' WHERE id=$1", [job.rows[0].id]);',
        '    await checkWatchlistAlerts(data);',
        '  } catch (err) {',
        '    const backoff = Math.min(60 * job.rows[0].attempts, 3600);  // cap at 1hr',
        '    await db.query(`',
        '      UPDATE scrape_jobs SET status=\'pending\', last_error=$1,',
        '      run_after=NOW()+$2*interval\'1 second\' WHERE id=$3`,',
        '      [err.message, backoff, job.rows[0].id]);',
        '  }',
        '}',
        '',
        '// Cron schedule',
        'cron.schedule("*/2 * * * *", processScrapeJobs);  // every 2 minutes',
      ]),
      gap(0, 40),

      h2('6.2 Cron Schedule'),
      gap(0, 20),
      tbl(
        ['Job', 'Schedule', 'What it does'],
        [
          ['Process scrape queue', 'Every 2 minutes', 'Picks up one pending job, scrapes, stores, checks alerts'],
          ['Enqueue watchlisted products', 'Every 30 minutes', 'Finds all watchlist entries, inserts high-priority scrape_jobs'],
          ['Enqueue stale listings', 'Every 4 hours', 'Finds listings not scraped in >4 hrs, inserts normal-priority jobs'],
          ['Cleanup old price history', 'Weekly (Sunday 3AM)', 'DELETE price_history rows older than 180 days'],
          ['Cleanup done scrape jobs', 'Daily (2AM)', 'DELETE scrape_jobs with status=done older than 7 days'],
        ],
        [2400, 1800, 5160]
      ),
      gap(0, 40),
      callout('Render.com note', 'Free tier Render web services spin down after 15 minutes of inactivity. Use a free cron monitor (cron-job.org) to ping your /health endpoint every 10 minutes to keep the dyno awake.', C.amberLt, C.amber, C.amber),

      // ── SECTION 7: DEPLOYMENT ────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('7. Deployment (Free Options Only)'),

      h2('7.1 Free Infrastructure Stack'),
      gap(0, 20),
      tbl(
        ['Service', 'Provider', 'Free Tier Limits', 'Purpose'],
        [
          ['Backend API + cron', 'Render.com', '512 MB RAM, spins down on idle', 'Hosts the Node.js monolith'],
          ['PostgreSQL', 'Neon.tech', '512 MB storage, 0.25 vCPU, 1 project', 'Serverless Postgres, stays always-on'],
          ['Email alerts', 'Resend.com', '100 emails/day, 3,000/month', 'Price drop notifications'],
          ['Dyno keep-alive', 'cron-job.org', 'Unlimited free HTTP cron triggers', 'Ping /health every 10 min'],
          ['Extension hosting', 'Chrome Web Store', '$5 one-time developer fee', 'Distribute extension to users'],
          ['Source + CI', 'GitHub + GitHub Actions', 'Free for public repos', 'Deploy to Render on push'],
        ],
        [1800, 1500, 2500, 3560]
      ),
      gap(0, 60),

      h2('7.2 Environment Variables Required'),
      gap(0, 20),
      ...codeblock([
        '# Database',
        'DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/pricescope?sslmode=require',
        '',
        '# Auth',
        'JWT_SECRET=your-long-random-secret-min-32-chars',
        '',
        '# Email',
        'RESEND_API_KEY=re_xxxxxxxxxxxx',
        'RESEND_FROM_EMAIL=alerts@yourdomain.com',
        '',
        '# App',
        'NODE_ENV=production',
        'PORT=3000',
        '',
        '# Optional: Playwright settings',
        'PLAYWRIGHT_BROWSERS_PATH=0   # use system Chromium on Render',
      ]),
      gap(0, 40),

      h2('7.3 Local Development Setup'),
      gap(0, 20),
      li('Node.js 20 LTS'),
      li('PostgreSQL 15 (local) or point DATABASE_URL at Neon.tech'),
      li('Install Playwright: npx playwright install chromium'),
      li('Load extension unpacked in Chrome: chrome://extensions → Developer mode → Load unpacked'),
      li('Run: node src/index.js (starts API + cron in one process)'),
      gap(0, 40),

      h2('7.4 GitHub Actions — Auto-Deploy to Render'),
      gap(0, 20),
      ...codeblock([
        '# .github/workflows/deploy.yml',
        'on: [push to main]',
        'jobs:',
        '  deploy:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: npm ci && npm test',
        '      - uses: johnbeynon/render-deploy-action@v0.0.8',
        '        with:',
        '          service-id: ${{ secrets.RENDER_SERVICE_ID }}',
        '          api-key: ${{ secrets.RENDER_API_KEY }}',
      ]),

      // ── SECTION 8: FEATURE RETENTION ────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('8. Feature Retention — Nothing Critical Is Lost'),

      gap(0, 20),
      tbl(
        ['Feature', 'Status in MVP', 'Implementation note'],
        [
          ['Product detection from extension', { text: 'Fully retained', bold: true, color: C.green }, 'Content script extracts title, price, model no., URL, brand from DOM on every target platform page'],
          ['Cross-platform comparison', { text: 'Fully retained', bold: true, color: C.green }, 'Limited to platforms with working scrapers. Start with 4 (Amazon, Flipkart, Myntra, Croma). Expand by adding adapters.'],
          ['Real price history', { text: 'Fully retained', bold: true, color: C.green }, 'Every scraper run appends a row to price_history. Extension renders a sparkline chart from the returned time-series array.'],
          ['Price drop alerts', { text: 'Fully retained', bold: true, color: C.green }, 'After each successful scrape, compare new price to watchlist target. If below → send Resend email. Simple, reliable.'],
          ['Watchlist', { text: 'Fully retained', bold: true, color: C.green }, 'User can toggle watchlist from popup. Stored in watchlist table. Powers priority scrape scheduling.'],
          ['Confidence-based matching', { text: 'Fully retained', bold: true, color: C.green }, 'Every comparison result is labeled: Exact Match / Likely Match. Results below 0.75 score are suppressed.'],
          ['Data freshness indicator', { text: 'Fully retained', bold: true, color: C.green }, 'Every response includes last_scraped_at per listing. Extension shows "4 hrs ago" so users know the data age.'],
        ],
        [2200, 1800, 5360]
      ),

      // ── SECTION 9: TRADEOFFS ─────────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('9. Tradeoff Explanations'),
      p('Every simplification was a deliberate decision, not a shortcut. Here is the engineering reasoning behind each one.'),
      gap(0, 40),

      h3('9.1 Monolith instead of microservices'),
      ...tradeoff(
        'Separate API service, scraper service, notification service, scheduler service',
        'Microservices require service discovery, inter-service networking, separate deployment pipelines, and distributed tracing to debug. None of these challenges exist until you have multiple developers and high load.',
        'All functionality runs in one Node.js process. Debugging is straightforward: one log stream, one deploy, one crash means one restart. Zero network latency between components.'
      ),

      h3('9.2 Table-as-queue instead of Redis + BullMQ'),
      ...tradeoff(
        'Redis server + BullMQ with priority queues, dead-letter queues, concurrency controls, rate limiting per worker',
        'Redis is a paid add-on on Render. BullMQ adds operational complexity. At MVP scrape volume (one listing every 2–8 seconds), Postgres row locking with SKIP LOCKED is a proven, sufficient queue implementation.',
        'No priority queue fan-out. Jobs are processed one at a time. At MVP scale with a small catalog, this is a feature: it naturally rate-limits scraping without a proxy network.'
      ),

      h3('9.3 Plain Postgres instead of TimescaleDB + pgvector'),
      ...tradeoff(
        'TimescaleDB hypertable partitioning for price_history, pgvector for embedding-based NLP matching',
        'TimescaleDB requires a non-standard Postgres build not available on Neon.tech free tier. pgvector requires generating embeddings via an ML model. Both are genuinely needed at 10M+ rows and 1M+ products — not at 5,000–50,000.',
        'Price history queries may slow slightly at very high row counts (months away). Token-based matching (Jaccard similarity) handles the product catalog size well. No functionality is removed — only performance headroom.'
      ),

      h3('9.4 Direct scraping instead of residential proxy network'),
      ...tradeoff(
        'Rotating residential proxies (Bright Data, Oxylabs) at $300–500/month',
        'Proxy networks are expensive and still get blocked. The extension-assisted collection model means the most important price observations (what the user is actually viewing) happen in a real browser session and are never blocked. Background scrapers use respectful delays and stealth mode.',
        'Background scrapers may occasionally get blocked by major platforms (especially Amazon). Mitigation: exponential backoff, reduced frequency, and extension-sourced data as the primary signal. If background scraping fails for a listing, extension observations keep the data fresh for active users.'
      ),

      h3('9.5 Email alerts instead of push notifications'),
      ...tradeoff(
        'Firebase Cloud Messaging + mobile SDK + notification permission flows',
        'Push notifications require a mobile app or a service worker registration flow in the extension. Resend email requires zero client-side setup, works immediately, and is free for 3,000 emails/month.',
        'Alerts are not instant (delivered when the scraper runs, up to 30 minutes for watchlisted items). For MVP, email is the right UX: it\'s persistent, contains full context (product name, old price, new price, buy link), and requires no permission prompts.'
      ),

      h3('9.6 No visual (ML) matching'),
      ...tradeoff(
        'Image perceptual hashing + TensorFlow feature vectors for fashion category matching',
        'Generating and comparing image feature vectors requires either a local ML inference server (too heavy for free tier) or a paid API. Fashion matching via title tokens + brand + attribute extraction handles the majority of cases adequately.',
        'Fashion results will occasionally miss items with very different titles for the same product (e.g., a kurti listed under different regional names). These will be rejected by the confidence threshold rather than shown incorrectly — maintaining trust at the cost of coverage.'
      ),

      // ── SECTION 10: IMPLEMENTATION ROADMAP ──────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      ...h1('10. Implementation Roadmap (6–8 Weeks)'),

      gap(0, 20),
      tbl(
        ['Week', 'Focus', 'Deliverable'],
        [
          ['1', 'Foundation', 'Postgres schema created on Neon.tech. Express app with /api/compare, /api/watchlist endpoints. JWT auth middleware. Unit tests for matching functions.'],
          ['2', 'Extension (core)', 'Content script running on amazon.in and flipkart.com. Extracts and POSTs product signals. Popup UI shows raw JSON response.'],
          ['3', 'Scrapers', 'Playwright adapters for Amazon, Flipkart, Myntra, Croma. Scrape job insertion on cold path. Test with 10 seed products.'],
          ['4', 'Matching engine', 'Model number regex library. Jaccard token scorer. Confidence labeling. Integration test: open an Amazon phone page, see Flipkart price returned.'],
          ['5', 'Price history + UI', 'price_history populated by scrapers. Response includes time-series arrays. Popup renders sparkline chart (Chart.js). Freshness timestamp shown.'],
          ['6', 'Watchlist + alerts', 'Watchlist toggle in popup. Resend email on price drop detection. Cron job enqueues watchlisted items at high priority.'],
          ['7', 'Deployment + seed', 'Deploy to Render.com. Point to Neon.tech. Seed 30 popular products. cron-job.org keep-alive configured. Load test with 10 concurrent users.'],
          ['8', 'Polish + demo', 'Handle edge cases (scrape failures, missing data). Add stale data indicators. Write README. Record demo video. Prep for portfolio.'],
        ],
        [600, 1600, 7160]
      ),
      gap(0, 80),

      // ── FOOTER ──────────────────────────────────────────────────────────────
      rule(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 0 },
        children: [new TextRun({ text: 'PriceScope MVP Architecture — Free-Tier Buildable Version', font: 'Arial', size: 17, color: C.muted })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 0 },
        children: [new TextRun({ text: 'Technically sound · Practically implementable · Demo-ready · Portfolio-worthy', font: 'Arial', size: 16, color: C.muted })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("./PriceScope_MVP_Architecture.docx", buffer);
  console.log('Done');
});