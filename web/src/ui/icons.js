/* Inline SVG icons (ported from the Django `icon` template filter). */
import { raw } from '../util.js';

const WRAP = (inner) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
 "psychiatry": "<path d=\"M24 6c-9 0-15 6-15 14 0 5 2 8 5 10v8h8v-4h4c8 0 13-6 13-14S34 6 24 6z\"/><path d=\"M19 18c2-2 6-2 8 0M20 25c2 2 5 2 7 0\"/>",
 "neuroscience": "<circle cx=\"24\" cy=\"24\" r=\"4\"/><circle cx=\"10\" cy=\"12\" r=\"3\"/><circle cx=\"38\" cy=\"12\" r=\"3\"/><circle cx=\"10\" cy=\"36\" r=\"3\"/><circle cx=\"38\" cy=\"36\" r=\"3\"/><path d=\"M12 14l9 7M36 14l-9 7M12 34l9-7M36 34l-9-7\"/>",
 "oncology": "<path d=\"M24 42S8 32 8 19c0-6 4-10 9-10 3 0 5 1 7 4 2-3 4-4 7-4 5 0 9 4 9 10 0 13-16 23-16 23z\"/><path d=\"M17 22h14M24 15v14\"/>",
 "cardiology": "<path d=\"M4 26h9l4-10 6 20 5-14 3 4h13\"/><path d=\"M24 8c-3-4-12-3-12 4 0 5 5 8 12 14 7-6 12-9 12-14 0-7-9-8-12-4z\" opacity=\".45\"/>",
 "public-health": "<circle cx=\"24\" cy=\"24\" r=\"17\"/><path d=\"M7 24h34M24 7c6 5 8 11 8 17s-2 12-8 17c-6-5-8-11-8-17s2-12 8-17z\"/>",
 "pediatrics": "<circle cx=\"24\" cy=\"18\" r=\"9\"/><path d=\"M20 17h.01M28 17h.01M20 22c2 2 6 2 8 0\"/><path d=\"M10 42c1-8 6-11 14-11s13 3 14 11\"/>",
 "computational-research": "<rect x=\"6\" y=\"9\" width=\"36\" height=\"25\" rx=\"3\"/><path d=\"M16 42h16M24 34v8M17 20l-4 4 4 4M31 20l4 4-4 4M26 18l-4 12\"/>",
 "research": "<path d=\"M18 6h12M20 6v14L9 38a3 3 0 0 0 3 5h24a3 3 0 0 0 3-5L28 20V6\"/><path d=\"M14 31h20\"/>",
 "data": "<path d=\"M7 40V8M7 40h34\"/><path d=\"M14 32l8-9 6 5 11-14\"/><circle cx=\"14\" cy=\"32\" r=\"2\"/><circle cx=\"22\" cy=\"23\" r=\"2\"/><circle cx=\"28\" cy=\"28\" r=\"2\"/><circle cx=\"39\" cy=\"14\" r=\"2\"/>",
 "computational": "<rect x=\"14\" y=\"14\" width=\"20\" height=\"20\" rx=\"3\"/><path d=\"M20 14V6M28 14V6M20 42v-8M28 42v-8M14 20H6M14 28H6M42 20h-8M42 28h-8\"/><path d=\"M21 24h6\"/>",
 "cro": "<path d=\"M24 5l16 6v11c0 10-7 17-16 21C15 39 8 32 8 22V11z\"/><path d=\"M17 24l5 5 9-10\"/>",
 "default": "<circle cx=\"24\" cy=\"24\" r=\"16\"/><path d=\"M24 14v10l7 4\"/>"
};
const ALIASES = {
 "research-services": "research",
 "data-statistics": "data",
 "research-operations-cro": "cro",
 "research services": "research",
 "data & statistics": "data",
 "computational research": "computational",
 "research operations / cro": "cro"
};

export function icon(value) {
  let key = String(value ?? '').toLowerCase();
  key = ALIASES[key] ?? key;
  return raw(WRAP(ICONS[key] ?? ICONS.default));
}
