#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

function loadDocument(filePath) {
  const content = readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  const result = spawnSync('npx', ['--yes', 'js-yaml@4.1.0', filePath], {
    encoding: 'utf8',
    maxBuffer: 1 << 28
  });
  if (result.status !== 0) {
    throw new Error(`Failed to parse YAML file ${filePath}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDrawioValue(htmlContent = '') {
  return escapeXml(htmlContent);
}

function sanitizeId(str = '') {
  return String(str).replace(/[^a-zA-Z0-9_]/g, '_');
}

// ==========================================
// 1. MERMAID RENDERER
// ==========================================
export function renderMermaid(doc) {
  const isSystem = Boolean(doc.services || doc.topics);
  if (isSystem) {
    return renderSystemMermaid(doc);
  }
  return renderEnterpriseMermaid(doc);
}

function renderSystemMermaid(doc) {
  const lines = [
    '```mermaid',
    'flowchart TB',
    `    %% ${doc.title || 'System Architecture'}`
  ];

  // Solutions
  if (doc.solutions && doc.solutions.length > 0) {
    lines.push('    subgraph Solutions["Solutions Tier (Applications & Tools)"]');
    lines.push('        direction TB');
    for (const sol of doc.solutions) {
      const id = sanitizeId(sol.id);
      lines.push(`        ${id}["${escapeHtml(sol.name)}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  // Services
  if (doc.services && doc.services.length > 0) {
    lines.push('    subgraph Services["Domain Tier (Core Domain Services)"]');
    lines.push('        direction TB');
    for (const svc of doc.services) {
      const id = sanitizeId(svc.id);
      const apis = (svc.apis || []).map(escapeHtml).join('<br/>• ');
      const label = apis ? `<b>${escapeHtml(svc.name)}</b><br/><i>APIs:</i><br/>• ${apis}` : `<b>${escapeHtml(svc.name)}</b>`;
      lines.push(`        ${id}["${label}"]`);
    }
    lines.push('    end');
    lines.push('');
  }

  // Topics (Data Mesh)
  if (doc.topics && doc.topics.length > 0) {
    lines.push('    subgraph DataMesh["Data Mesh Tier (Event & State Streams)"]');
    lines.push('        direction TB');
    for (const top of doc.topics) {
      const id = sanitizeId(top.name);
      const alias = top.alias ? ` (${top.alias})` : '';
      const keyInfo = top.key ? `<br/>key: ${top.key}` : '';
      lines.push(`        ${id}[("${escapeHtml(top.name)}${escapeHtml(alias)}${keyInfo}")]`);
    }
    lines.push('    end');
    lines.push('');
  }

  // Legacy Integrations
  if (doc.legacyIntegrations && doc.legacyIntegrations.length > 0) {
    lines.push('    subgraph Legacy["Legacy Tier (Inbound Integrations)"]');
    lines.push('        direction TB');
    for (const leg of doc.legacyIntegrations) {
      const legId = sanitizeId(leg.id);
      const srcId = `${legId}_src`;
      const adaptId = `${legId}_adapter`;
      lines.push(`        ${srcId}[("${escapeHtml(leg.source)} (${escapeHtml(leg.environment)})")]`);
      lines.push(`        ${adaptId}["${escapeHtml(leg.adapter)}"]`);
      lines.push(`        ${srcId} --> ${adaptId}`);
      if (leg.targetTopic) {
        const topId = sanitizeId(leg.targetTopic);
        lines.push(`        ${adaptId} -.->|captures into| ${topId}`);
      }
    }
    lines.push('    end');
    lines.push('');
  }

  // Connect Solutions to Services (API invocation)
  if (doc.solutions) {
    for (const sol of doc.solutions) {
      const solId = sanitizeId(sol.id);
      if (sol.invokes && doc.services) {
        for (const api of sol.invokes) {
          const targetSvc = doc.services.find(s => (s.apis || []).includes(api));
          if (targetSvc) {
            lines.push(`    ${solId} ==>|invokes ${api}| ${sanitizeId(targetSvc.id)}`);
          }
        }
      }
      if (sol.subscribes) {
        for (const topName of sol.subscribes) {
          lines.push(`    ${sanitizeId(topName)} -.->|subscribes| ${solId}`);
        }
      }
    }
  }

  // Connect Services to Topics (Publish & Subscribe)
  if (doc.services) {
    for (const svc of doc.services) {
      const svcId = sanitizeId(svc.id);
      if (svc.publishes) {
        for (const topName of svc.publishes) {
          lines.push(`    ${svcId} -->|publishes| ${sanitizeId(topName)}`);
        }
      }
      if (svc.subscribes) {
        for (const topName of svc.subscribes) {
          lines.push(`    ${sanitizeId(topName)} -.->|subscribes| ${svcId}`);
        }
      }
    }
  }

  // Styling
  lines.push('');
  lines.push('    %% Styling classes');
  lines.push('    classDef solution fill:#fff2cc,stroke:#d6b656,stroke-width:2px,color:#000;');
  lines.push('    classDef service fill:#d5e8d4,stroke:#82b366,stroke-width:2px,color:#000;');
  lines.push('    classDef topic fill:#dae8fc,stroke:#6c8ebf,stroke-width:2px,color:#000;');
  lines.push('    classDef legacy fill:#f5f5f5,stroke:#666666,stroke-width:2px,color:#000;');

  if (doc.solutions) {
    for (const sol of doc.solutions) lines.push(`    class ${sanitizeId(sol.id)} solution;`);
  }
  if (doc.services) {
    for (const svc of doc.services) lines.push(`    class ${sanitizeId(svc.id)} service;`);
  }
  if (doc.topics) {
    for (const top of doc.topics) lines.push(`    class ${sanitizeId(top.name)} topic;`);
  }

  lines.push('```');
  return lines.join('\n');
}

function renderEnterpriseMermaid(doc) {
  const lines = [
    '```mermaid',
    'flowchart TB',
    `    %% ${doc.title || 'Enterprise Architecture'}`
  ];

  if (doc.clients) {
    const auds = (doc.clients.audiences || []).join(', ');
    lines.push(`    Clients["<b>${escapeHtml(doc.clients.name)}</b><br/><i>${escapeHtml(auds)}</i>"]`);
    lines.push('');
  }

  if (doc.tiers) {
    for (const tier of doc.tiers) {
      const tierId = sanitizeId(tier.id);
      lines.push(`    subgraph ${tierId}["${escapeHtml(tier.name)} (${escapeHtml(tier.horizon)})"]`);
      lines.push('        direction TB');
      for (const comp of (tier.components || [])) {
        const compId = sanitizeId(comp.id);
        const contracts = (comp.contracts || []).join(', ');
        const label = contracts ? `<b>${escapeHtml(comp.name)}</b><br/>[${escapeHtml(contracts)}]` : `<b>${escapeHtml(comp.name)}</b>`;
        lines.push(`        ${compId}["${label}"]`);
      }
      lines.push('    end');
      lines.push('');
    }
  }

  if (doc.flows) {
    for (const flow of doc.flows) {
      const fromId = sanitizeId(flow.from);
      const toId = sanitizeId(flow.to);
      const label = flow.contract ? `|${flow.contract}|` : '';
      if (flow.pattern === 'event-stream' || flow.pattern === 'data-capture') {
        lines.push(`    ${fromId} -.->${label} ${toId}`);
      } else {
        lines.push(`    ${fromId} -->${label} ${toId}`);
      }
    }
  }

  lines.push('');
  lines.push('    classDef client fill:#e1d5e7,stroke:#9673a6,stroke-width:2px,color:#000;');
  lines.push('    classDef comp fill:#ffffff,stroke:#333333,stroke-width:1.5px,color:#000;');
  if (doc.clients) lines.push('    class Clients client;');
  lines.push('```');
  return lines.join('\n');
}

// ==========================================
// 2. DRAW.IO RENDERER
// ==========================================
export function renderDrawio(doc) {
  const isSystem = Boolean(doc.services || doc.topics);
  if (isSystem) {
    return renderSystemDrawio(doc);
  }
  return renderEnterpriseDrawio(doc);
}

function renderSystemDrawio(doc) {
  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" value="services" />',
    '<mxCell id="2" parent="0" value="solutions" />',
    '<mxCell id="3" parent="0" value="public topics" />',
    '<mxCell id="4" parent="0" value="legacy-integration" />',
    '<mxCell id="5" parent="0" value="schemas-and-endpoints" />'
  ];

  let nextId = 100;
  const genId = (prefix) => `${prefix}_${nextId++}`;
  const coords = new Map();

  // 1. Solutions (Layer 2, Top row)
  const solutions = doc.solutions || [];
  const solStartX = 100;
  const solY = 80;
  const solW = 160;
  const solH = 90;
  const solGap = 60;

  solutions.forEach((sol, index) => {
    const x = solStartX + index * (solW + solGap);
    const cellId = `sol_${sanitizeId(sol.id)}`;
    coords.set(sol.id, { x, y: solY, w: solW, h: solH, cellId });
    const val = toDrawioValue(escapeHtml(sol.name));
    cells.push(
      `<mxCell id="${cellId}" parent="2" style="whiteSpace=wrap;html=1;rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=1;align=center;verticalAlign=middle;" value="${val}" vertex="1">` +
      `<mxGeometry x="${x}" y="${solY}" width="${solW}" height="${solH}" as="geometry" />` +
      `</mxCell>`
    );
  });

  // 2. Services (Layer 1, Middle row)
  const services = doc.services || [];
  const svcStartX = 100;
  const svcY = 280;
  const svcW = 160;
  const svcH = 100;
  const svcGap = 60;

  services.forEach((svc, index) => {
    const x = svcStartX + index * (svcW + svcGap);
    const cellId = `svc_${sanitizeId(svc.id)}`;
    coords.set(svc.id, { x, y: svcY, w: svcW, h: svcH, cellId });
    const apis = (svc.apis || []).map(escapeHtml).join('&lt;br/&gt;');
    const htmlVal = `&lt;b&gt;${escapeHtml(svc.name)}&lt;/b&gt;` + (apis ? `&lt;hr style=&quot;margin:4px 0;&quot;/&gt;&lt;font style=&quot;font-size:10px;&quot;&gt;${apis}&lt;/font&gt;` : '');
    const val = escapeXml(htmlVal);
    cells.push(
      `<mxCell id="${cellId}" parent="1" style="whiteSpace=wrap;html=1;rounded=0;fillColor=#d5e8d4;strokeColor=#82b366;align=center;verticalAlign=middle;" value="${val}" vertex="1">` +
      `<mxGeometry x="${x}" y="${svcY}" width="${svcW}" height="${svcH}" as="geometry" />` +
      `</mxCell>`
    );
  });

  // 3. Topics (Layer 3, Bottom row)
  const topics = doc.topics || [];
  const topStartX = 100;
  const topY = 490;
  const topW = 180;
  const topH = 50;
  const topGap = 40;

  topics.forEach((top, index) => {
    const x = topStartX + (index % 4) * (topW + topGap);
    const y = topY + Math.floor(index / 4) * (topH + 30);
    const cellId = `top_${sanitizeId(top.name)}`;
    coords.set(top.name, { x, y, w: topW, h: topH, cellId });
    const htmlVal = `&lt;b&gt;${escapeHtml(top.alias || top.name)}&lt;/b&gt;&lt;br/&gt;&lt;font style=&quot;font-size:9px;&quot;&gt;${escapeHtml(top.key ? `key: ${top.key}` : '')}&lt;/font&gt;`;
    const val = escapeXml(htmlVal);
    cells.push(
      `<mxCell id="${cellId}" parent="3" style="shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;fillColor=#dae8fc;strokeColor=#6c8ebf;align=center;verticalAlign=middle;" value="${val}" vertex="1">` +
      `<mxGeometry x="${x}" y="${y}" width="${topW}" height="${topH}" as="geometry" />` +
      `</mxCell>`
    );
  });

  // 4. Legacy Integration (Layer 4)
  const legacyList = doc.legacyIntegrations || [];
  const legY = 660;
  legacyList.forEach((leg, index) => {
    const legX = 100 + index * 320;
    const boxId = `leg_box_${index}`;
    const dbId = `leg_db_${index}`;
    const adId = `leg_ad_${index}`;

    cells.push(
      `<mxCell id="${boxId}" parent="4" style="swimlane;startSize=24;fillColor=#f5f5f5;fontColor=#333333;strokeColor=#666666;" value="${escapeXml(leg.name + ' (' + leg.environment + ')')}" vertex="1">` +
      `<mxGeometry x="${legX}" y="${legY}" width="280" height="130" as="geometry" />` +
      `</mxCell>`
    );
    cells.push(
      `<mxCell id="${dbId}" parent="${boxId}" style="shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=12;fillColor=#ffffff;strokeColor=#666666;" value="${escapeXml(leg.source)}" vertex="1">` +
      `<mxGeometry x="20" y="40" width="70" height="70" as="geometry" />` +
      `</mxCell>`
    );
    cells.push(
      `<mxCell id="${adId}" parent="${boxId}" style="whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" value="${escapeXml(leg.adapter)}" vertex="1">` +
      `<mxGeometry x="140" y="50" width="110" height="50" as="geometry" />` +
      `</mxCell>`
    );
    cells.push(
      `<mxCell id="${genId('edge')}" parent="${boxId}" source="${dbId}" target="${adId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=2;" edge="1">` +
      `<mxGeometry relative="1" as="geometry" />` +
      `</mxCell>`
    );

    if (leg.targetTopic && coords.has(leg.targetTopic)) {
      const topCell = coords.get(leg.targetTopic).cellId;
      cells.push(
        `<mxCell id="${genId('edge')}" parent="4" source="${adId}" target="${topCell}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;html=1;strokeColor=#b46504;strokeWidth=2;" edge="1">` +
        `<mxGeometry relative="1" as="geometry" />` +
        `</mxCell>`
      );
    }
  });

  // 5. Connectors: Solutions -> Services (API calls)
  solutions.forEach(sol => {
    const solCoord = coords.get(sol.id);
    if (!solCoord) return;
    (sol.invokes || []).forEach(api => {
      const targetSvc = services.find(s => (s.apis || []).includes(api));
      if (targetSvc && coords.has(targetSvc.id)) {
        const svcCoord = coords.get(targetSvc.id);
        cells.push(
          `<mxCell id="${genId('edge')}" parent="1" source="${solCoord.cellId}" target="${svcCoord.cellId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeWidth=2;strokeColor=#006EAF;" value="${escapeXml(api)}" edge="1">` +
          `<mxGeometry relative="1" as="geometry" />` +
          `</mxCell>`
        );
      }
    });
  });

  // 6. Connectors: Services -> Topics (Publish) & Topics -> Subscribers
  services.forEach(svc => {
    const svcCoord = coords.get(svc.id);
    if (!svcCoord) return;
    (svc.publishes || []).forEach(topName => {
      if (coords.has(topName)) {
        const topCoord = coords.get(topName);
        cells.push(
          `<mxCell id="${genId('edge')}" parent="3" source="${svcCoord.cellId}" target="${topCoord.cellId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#2D9C5E;strokeWidth=2;" edge="1">` +
          `<mxGeometry relative="1" as="geometry" />` +
          `</mxCell>`
        );
      }
    });
    (svc.subscribes || []).forEach(topName => {
      if (coords.has(topName)) {
        const topCoord = coords.get(topName);
        cells.push(
          `<mxCell id="${genId('edge')}" parent="3" source="${topCoord.cellId}" target="${svcCoord.cellId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;html=1;strokeColor=#6c8ebf;" edge="1">` +
          `<mxGeometry relative="1" as="geometry" />` +
          `</mxCell>`
        );
      }
    });
  });

  // 7. Connectors: Topics -> Solution subscribers
  solutions.forEach(sol => {
    const solCoord = coords.get(sol.id);
    if (!solCoord) return;
    (sol.subscribes || []).forEach(topName => {
      if (coords.has(topName)) {
        const topCoord = coords.get(topName);
        cells.push(
          `<mxCell id="${genId('edge')}" parent="2" source="${topCoord.cellId}" target="${solCoord.cellId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;dashed=1;html=1;strokeColor=#d6b656;" edge="1">` +
          `<mxGeometry relative="1" as="geometry" />` +
          `</mxCell>`
        );
      }
    });
  });

  return [
    '<mxfile host="Electron" agent="opencode-architecture-renderer" version="20.0.0">',
    '  <diagram name="Architecture" id="arch_diagram">',
    '    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="2200" pageHeight="1400" math="0" shadow="0">',
    '      <root>',
    cells.map(c => `        ${c}`).join('\n'),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>'
  ].join('\n');
}

function renderEnterpriseDrawio(doc) {
  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />'
  ];

  let nextId = 100;
  const genId = (p) => `${p}_${nextId++}`;

  // Left Ribbon: Business Value
  cells.push(
    `<mxCell id="bv_ribbon" parent="1" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;gradientColor=#7ea6e0;strokeColor=#6c8ebf;" value="" vertex="1">` +
    `<mxGeometry x="40" y="40" width="220" height="920" as="geometry" />` +
    `</mxCell>`
  );
  cells.push(
    `<mxCell id="bv_title" parent="1" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontStyle=1;fontSize=18;" value="Business Value" vertex="1">` +
    `<mxGeometry x="40" y="50" width="220" height="30" as="geometry" />` +
    `</mxCell>`
  );

  // Horizons in the ribbon
  const horizons = doc.horizons || [];
  horizons.forEach((hz, i) => {
    const y = 100 + i * 220;
    const tenets = (hz.tenets || []).map(t => `&bull; ${escapeHtml(t)}`).join('&lt;br/&gt;');
    const tenetsXml = escapeXml(tenets);
    cells.push(
      `<mxCell id="${genId('hz_title')}" parent="1" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontStyle=1;fontSize=15;" value="${escapeXml(hz.name)}" vertex="1">` +
      `<mxGeometry x="55" y="${y}" width="200" height="25" as="geometry" />` +
      `</mxCell>`
    );
    cells.push(
      `<mxCell id="${genId('hz_tenets')}" parent="1" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=top;fontSize=10;" value="${tenetsXml}" vertex="1">` +
      `<mxGeometry x="55" y="${y + 25}" width="200" height="180" as="geometry" />` +
      `</mxCell>`
    );
  });

  // Clients
  if (doc.clients) {
    cells.push(
      `<mxCell id="clients_box" parent="1" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;fontStyle=1;align=center;verticalAlign=middle;fontSize=14;" value="${escapeXml(doc.clients.name)}" vertex="1">` +
      `<mxGeometry x="320" y="40" width="800" height="50" as="geometry" />` +
      `</mxCell>`
    );
  }

  // Tiers (horizontal bands)
  const tiers = doc.tiers || [];
  tiers.forEach((tier, i) => {
    const tierY = 120 + i * 210;
    const tierColor = i === 0 ? '#fff2cc' : (i === 1 ? '#d5e8d4' : (i === 2 ? '#dae8fc' : '#f5f5f5'));
    const strokeColor = i === 0 ? '#d6b656' : (i === 1 ? '#82b366' : (i === 2 ? '#6c8ebf' : '#666666'));

    // Tier divider line
    cells.push(
      `<mxCell id="${genId('div')}" parent="1" style="endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;strokeColor=#999999;" edge="1">` +
      `<mxGeometry relative="1" as="geometry"><mxPoint x="300" y="${tierY}" as="sourcePoint" /><mxPoint x="1200" y="${tierY}" as="targetPoint" /></mxGeometry>` +
      `</mxCell>`
    );

    // Tier label
    cells.push(
      `<mxCell id="${genId('tier_lbl')}" parent="1" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontStyle=1;fontSize=14;" value="${escapeXml(tier.name)}" vertex="1">` +
      `<mxGeometry x="320" y="${tierY + 5}" width="200" height="25" as="geometry" />` +
      `</mxCell>`
    );

    // Components in tier
    const comps = tier.components || [];
    comps.forEach((comp, cIdx) => {
      const compX = 320 + cIdx * 260;
      const compY = tierY + 40;
      const compW = 230;
      const compH = 130;
      const contracts = (comp.contracts || []).map(escapeHtml).join('&lt;br/&gt;');
      const htmlVal = `&lt;b&gt;${escapeHtml(comp.name)}&lt;/b&gt;` + (contracts ? `&lt;hr style=&quot;margin:4px 0;&quot;/&gt;&lt;font style=&quot;font-size:10px;&quot;&gt;Contracts: ${contracts}&lt;/font&gt;` : '');
      const val = escapeXml(htmlVal);
      cells.push(
        `<mxCell id="comp_${sanitizeId(comp.id)}" parent="1" style="rounded=0;whiteSpace=wrap;html=1;fillColor=${tierColor};strokeColor=${strokeColor};align=center;verticalAlign=middle;" value="${val}" vertex="1">` +
        `<mxGeometry x="${compX}" y="${compY}" width="${compW}" height="${compH}" as="geometry" />` +
        `</mxCell>`
      );
    });
  });

  return [
    '<mxfile host="Electron" agent="opencode-architecture-renderer" version="20.0.0">',
    '  <diagram name="Enterprise Architecture" id="ea_diagram">',
    '    <mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="2400" pageHeight="1400" math="0" shadow="0">',
    '      <root>',
    cells.map(c => `        ${c}`).join('\n'),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>'
  ].join('\n');
}

// ==========================================
// 3. STANDALONE SVG RENDERER
// ==========================================
export function renderSvg(doc) {
  const isSystem = Boolean(doc.services || doc.topics);
  if (isSystem) {
    return renderSystemSvg(doc);
  }
  return renderEnterpriseSvg(doc);
}

function renderSystemSvg(doc) {
  const width = 1600;
  const height = 980;

  const solutions = doc.solutions || [];
  const services = doc.services || [];
  const topics = doc.topics || [];
  const legList = doc.legacyIntegrations || [];

  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">`,
    `  <defs>`,
    `    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`,
    `      <path d="M 0 1 L 10 5 L 0 9 z" fill="#4a5568" />`,
    `    </marker>`,
    `    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">`,
    `      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1" />`,
    `    </filter>`,
    `  </defs>`,
    `  <!-- Title Header -->`,
    `  <rect x="0" y="0" width="${width}" height="60" fill="#2d3748" />`,
    `  <text x="30" y="38" fill="#ffffff" font-size="22" font-weight="600">${escapeXml(doc.title || 'System Architecture')}</text>`
  ];

  // Section 1: Solutions (Top row)
  svgParts.push(`  <text x="40" y="95" fill="#744210" font-size="14" font-weight="700" letter-spacing="1">SOLUTION TIER — USER WORKSPACES</text>`);
  solutions.forEach((sol, i) => {
    const x = 40 + i * 480;
    const y = 110;
    const w = 440;
    const h = 80;
    svgParts.push(
      `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#fffaf0" stroke="#dd6b20" stroke-width="2" filter="url(#shadow)" />`,
      `  <text x="${x + 20}" y="${y + 32}" fill="#744210" font-size="16" font-weight="700">${escapeXml(sol.name)}</text>`,
      `  <text x="${x + 20}" y="${y + 55}" fill="#9c4221" font-size="12">${escapeXml((sol.description || '').slice(0, 60))}...</text>`
    );
  });

  // Section 2: Services (Middle row)
  svgParts.push(`  <text x="40" y="245" fill="#22543d" font-size="14" font-weight="700" letter-spacing="1">DOMAIN TIER — CORE SERVICES</text>`);
  services.forEach((svc, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 40 + col * 380;
    const y = 265 + row * 120;
    const w = 350;
    const h = 95;
    const apis = (svc.apis || []).join(' | ');
    svgParts.push(
      `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#f0fff4" stroke="#38a169" stroke-width="1.8" filter="url(#shadow)" />`,
      `  <text x="${x + 15}" y="${y + 26}" fill="#22543d" font-size="14" font-weight="700">${escapeXml(svc.name)}</text>`,
      `  <text x="${x + 15}" y="${y + 48}" fill="#276749" font-size="11">APIs: ${escapeXml(apis || 'Internal')}</text>`,
      `  <text x="${x + 15}" y="${y + 70}" fill="#4a5568" font-size="10">Pub: ${escapeXml((svc.publishes || []).join(', ') || 'None')}</text>`
    );
  });

  // Section 3: Topics (Data Mesh)
  svgParts.push(`  <text x="40" y="550" fill="#2b6cb0" font-size="14" font-weight="700" letter-spacing="1">DATA MESH TIER — EVENT &amp; STATE STREAMS</text>`);
  topics.forEach((top, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 40 + col * 380;
    const y = 570 + row * 85;
    const w = 350;
    const h = 65;
    svgParts.push(
      `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#ebf8ff" stroke="#3182ce" stroke-width="1.8" filter="url(#shadow)" />`,
      `  <text x="${x + 15}" y="${y + 25}" fill="#2b6cb0" font-size="13" font-weight="700">${escapeXml(top.name)}</text>`,
      `  <text x="${x + 15}" y="${y + 45}" fill="#4a5568" font-size="11">alias: ${escapeXml(top.alias || '-')}  |  key: ${escapeXml(top.key || '-')}</text>`
    );
  });

  // Section 4: Legacy Integrations
  if (legList.length > 0) {
    svgParts.push(`  <text x="40" y="780" fill="#4a5568" font-size="14" font-weight="700" letter-spacing="1">LEGACY TIER — INBOUND COURT INTEGRATIONS</text>`);
    legList.forEach((leg, i) => {
      const x = 40 + i * 500;
      const y = 800;
      const w = 480;
      const h = 80;
      svgParts.push(
        `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#edf2f7" stroke="#718096" stroke-width="1.8" filter="url(#shadow)" />`,
        `  <text x="${x + 15}" y="${y + 28}" fill="#2d3748" font-size="14" font-weight="700">${escapeXml(leg.name)} [${escapeXml(leg.environment)}]</text>`,
        `  <text x="${x + 15}" y="${y + 52}" fill="#4a5568" font-size="11">Source: ${escapeXml(leg.source)}  &rarr;  Adapter: ${escapeXml(leg.adapter)}  &rarr;  ${escapeXml(leg.targetTopic)}`.replace(/&rarr;/g, '→') + `</text>`
      );
    });
  }

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}

function renderEnterpriseSvg(doc) {
  const width = 1600;
  const height = 980;

  const svgParts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">`,
    `  <rect x="0" y="0" width="${width}" height="60" fill="#1a365d" />`,
    `  <text x="30" y="38" fill="#ffffff" font-size="22" font-weight="600">${escapeXml(doc.title || 'Enterprise Architecture')}</text>`
  ];

  // Ribbon (Horizons)
  svgParts.push(
    `  <rect x="30" y="80" width="280" height="860" rx="8" fill="#ebf8ff" stroke="#3182ce" stroke-width="2" />`,
    `  <text x="50" y="115" fill="#2b6cb0" font-size="18" font-weight="700">BUSINESS VALUE</text>`
  );

  (doc.horizons || []).forEach((hz, i) => {
    const y = 145 + i * 200;
    svgParts.push(
      `  <text x="50" y="${y}" fill="#2c5282" font-size="14" font-weight="700">${escapeXml(hz.name)}</text>`
    );
    (hz.tenets || []).forEach((t, ti) => {
      svgParts.push(
        `  <text x="55" y="${y + 20 + ti * 16}" fill="#4a5568" font-size="10">• ${escapeXml(t.slice(0, 36))}</text>`
      );
    });
  });

  // Clients
  if (doc.clients) {
    svgParts.push(
      `  <rect x="340" y="80" width="1220" height="60" rx="6" fill="#faf5ff" stroke="#805ad5" stroke-width="2" />`,
      `  <text x="360" y="116" fill="#553c9a" font-size="16" font-weight="700">${escapeXml(doc.clients.name)}: ${escapeXml((doc.clients.audiences || []).join(', '))}</text>`
    );
  }

  // Tiers
  (doc.tiers || []).forEach((tier, i) => {
    const y = 160 + i * 190;
    const bg = i === 0 ? '#fffaf0' : (i === 1 ? '#f0fff4' : (i === 2 ? '#ebf8ff' : '#f7fafc'));
    const stroke = i === 0 ? '#dd6b20' : (i === 1 ? '#38a169' : (i === 2 ? '#3182ce' : '#718096'));
    svgParts.push(
      `  <rect x="340" y="${y}" width="1220" height="170" rx="6" fill="${bg}" stroke="${stroke}" stroke-width="2" />`,
      `  <text x="360" y="${y + 28}" fill="#2d3748" font-size="16" font-weight="700">${escapeXml(tier.name)} (${escapeXml(tier.horizon)})</text>`
    );

    (tier.components || []).forEach((comp, ci) => {
      const cx = 360 + ci * 295;
      const cy = y + 42;
      svgParts.push(
        `  <rect x="${cx}" y="${cy}" width="${280}" height="105" rx="4" fill="#ffffff" stroke="${stroke}" stroke-width="1.2" />`,
        `  <text x="${cx + 12}" y="${cy + 26}" fill="#2d3748" font-size="13" font-weight="700">${escapeXml(comp.name)}</text>`,
        `  <text x="${cx + 12}" y="${cy + 52}" fill="#4a5568" font-size="10">kind: ${escapeXml(comp.kind || '-')}</text>`,
        `  <text x="${cx + 12}" y="${cy + 75}" fill="#718096" font-size="10">contracts: ${escapeXml((comp.contracts || []).join(', ') || 'None')}</text>`
      );
    });
  });

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}

// ==========================================
// CLI EXECUTION
// ==========================================
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/render-architecture.mjs <input-file> [options]

Arguments:
  <input-file>              Path to architecture YAML or JSON file

Options:
  --format, -f <fmt>        Output format: 'mermaid', 'drawio', 'svg', or 'all' (default: auto-detected from output extension, or mermaid)
  --output, -o <file>       Output file path (default: stdout for mermaid, or <input>.<fmt> for files)
  --help, -h                Show this help message

Examples:
  node scripts/render-architecture.mjs architecture/civil-procedure-system.yaml --format mermaid
  node scripts/render-architecture.mjs architecture/civil-procedure-system.yaml --format drawio -o architecture/CivilProcedure.drawio
  node scripts/render-architecture.mjs architecture/civil-procedure-system.yaml --format svg -o architecture/CivilProcedure.svg
  node scripts/render-architecture.mjs architecture/civil-procedure-system.yaml --format all
`);
    process.exit(0);
  }

  const inputFile = args[0];
  let format = null;
  let outputFile = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' || args[i] === '-f') {
      format = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      outputFile = args[++i];
    }
  }

  if (!format && outputFile) {
    const ext = extname(outputFile).toLowerCase();
    if (ext === '.drawio' || ext === '.xml') format = 'drawio';
    else if (ext === '.svg') format = 'svg';
    else if (ext === '.mmd' || ext === '.md') format = 'mermaid';
  }
  if (!format) format = 'mermaid';

  const doc = loadDocument(resolve(inputFile));
  const baseName = inputFile.replace(/\.(yaml|yml|json)$/i, '');

  if (format === 'all') {
    const drawioOut = `${baseName}.drawio`;
    const svgOut = `${baseName}.svg`;
    const mmdOut = `${baseName}.mmd`;

    writeFileSync(drawioOut, renderDrawio(doc), 'utf8');
    writeFileSync(svgOut, renderSvg(doc), 'utf8');
    writeFileSync(mmdOut, renderMermaid(doc), 'utf8');

    console.log(`Successfully generated all formats:`);
    console.log(`  - Draw.io: ${drawioOut}`);
    console.log(`  - SVG:     ${svgOut}`);
    console.log(`  - Mermaid: ${mmdOut}`);
    return;
  }

  let result = '';
  if (format === 'mermaid') result = renderMermaid(doc);
  else if (format === 'drawio') result = renderDrawio(doc);
  else if (format === 'svg') result = renderSvg(doc);
  else {
    console.error(`Unknown format '${format}'. Supported formats: mermaid, drawio, svg, all`);
    process.exit(1);
  }

  if (outputFile) {
    writeFileSync(resolve(outputFile), result, 'utf8');
    console.log(`Rendered ${format} architecture to ${outputFile}`);
  } else {
    process.stdout.write(result + '\n');
  }
}

if (process.argv[1] && process.argv[1].endsWith('render-architecture.mjs')) {
  main();
}
