/* page-consumer-catalog.boot.js
 * Loads shared partials (header/footer + consumer sidebar) then loads page logic.
 * Requires: /assets/js/partials-loader.js (provide earlier).
 */
import { loadPartials } from '/assets/js/partials-loader.js';

await loadPartials({ sidebar: 'consumer' });
await import('/pages/consumer/catalog-browse.js');
