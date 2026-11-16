/* DekuDeals Card — Home Assistant Lovelace custom card */
const CARD_VERSION = "0.4.0";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const isHttps = (value) => typeof value === "string" && /^https:\/\//i.test(value);
const platformKey = (value) => String(value || "Unknown").trim().toLocaleLowerCase();

class DekuDealsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = undefined;
    this._query = "";
    this._platform = "all";
    this._format = "all";
    this._collectionType = "game";
    this._view = "collection";
    this._layout = "grid";
    this._collapsedGrouping = "platform";
    this._refreshing = false;
    this._selectedCopy = null;
    this._borrower = "";
    this._dueDate = "";
    this._newGame = "";
    this._newPlatform = "Switch";
    this._error = "";
    this._busy = false;
    this._boundClick = (event) => this._handleClick(event);
    this._boundInput = (event) => this._handleInput(event);
  }

  setConfig(config) {
    if (!config || !config.collection_entity || !config.inventory_entity) {
      throw new Error("DekuDeals Card requires collection_entity and inventory_entity.");
    }
    this._config = {
      title: "DekuDeals Collection",
      collection_entity: config.collection_entity,
      inventory_entity: config.inventory_entity,
      lent_out_entity: config.lent_out_entity || "",
      overdue_entity: config.overdue_entity || "",
      needs_review_entity: config.needs_review_entity || "",
      unmatched_entity: config.unmatched_entity || "",
      config_entry_id: config.config_entry_id || "",
      show_descriptions: config.show_descriptions !== false,
      show_inventory: config.show_inventory !== false,
      columns: Math.max(2, Math.min(8, Number(config.columns) || 4)),
      ...config,
    };
    this._layout = ["grid", "carousel", "collapsed"].includes(this._config.view_mode) ? this._config.view_mode : "grid";
    this._collapsedGrouping = this._config.collapsed_grouping === "alphabetical" ? "alphabetical" : "platform";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const entityIds = [
      this._config.collection_entity, this._config.inventory_entity,
      this._config.lent_out_entity, this._config.overdue_entity,
      this._config.needs_review_entity, this._config.unmatched_entity,
    ].filter(Boolean);
    const signature = entityIds.map((id) => {
      const state = hass?.states?.[id];
      return `${id}:${state?.state ?? ""}:${state?.last_updated ?? ""}`;
    }).join("|");
    if (signature !== this._lastHassSignature) {
      this._lastHassSignature = signature;
      this._render();
    }
  }

  get hass() { return this._hass; }
  getCardSize() { return 6; }

  _state(entityId) {
    return entityId && this._hass?.states?.[entityId] ? this._hass.states[entityId] : null;
  }
  _items() {
    const value = this._state(this._config.collection_entity)?.attributes?.items;
    return Array.isArray(value) ? value : [];
  }
  _copies() {
    const value = this._state(this._config.inventory_entity)?.attributes?.copies;
    return Array.isArray(value) ? value : [];
  }
  _count(entityId, fallback = 0) {
    const raw = this._state(entityId)?.state;
    const number = Number(raw);
    return Number.isFinite(number) ? number : fallback;
  }
  _itemPlatform(item) { return platformKey(item.platform); }
  _itemFormat(item) { return String(item.format || "unknown").toLowerCase(); }
  _filteredItems() {
    return this._items().filter((item) => {
      const title = String(item.name || "").toLowerCase();
      const matchesQuery = !this._query || title.includes(this._query.toLowerCase());
      const platform = this._itemPlatform(item);
      const matchesPlatform = this._platform === "all" || platform === this._platform;
      const matchesFormat = this._format === "all" || this._itemFormat(item) === this._format;
      const isDlc = item.item_type === "dlc";
      const matchesType = this._collectionType === "dlc" ? isDlc : !isDlc;
      return matchesQuery && matchesPlatform && matchesFormat && matchesType;
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config.collection_entity) return;
    const collection = this._state(this._config.collection_entity);
    const inventory = this._state(this._config.inventory_entity);
    const items = this._items();
    const platforms = [...new Set(items.map((item) => String(item.platform || "Unknown").trim() || "Unknown"))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
    if (platforms.length && !platforms.some((platform) => platformKey(platform) === platformKey(this._newPlatform))) {
      this._newPlatform = platforms[0];
    }
    const platformOptions = platforms.map((platform) =>
      `<option value="${esc(platformKey(platform))}">${esc(platform)}</option>`
    ).join("");
    const copies = this._copies();
    const filtered = this._filteredItems();
    const displayItems = items.filter((item) => this._collectionType === "dlc" ? item.item_type === "dlc" : item.item_type !== "dlc");
    const gameCount = items.filter((item) => item.item_type !== "dlc").length;
    const dlcCount = items.length - gameCount;
    const lent = copies.filter((copy) => copy.active_loan);
    const possession = copies.length - lent.length;
    const overdueCount = this._count(this._config.overdue_entity, lent.filter((copy) =>
      copy.active_loan?.due_date && copy.active_loan.due_date < new Date().toISOString().slice(0, 10)
    ).length);
    const reviewCount = this._count(this._config.needs_review_entity,
      copies.filter((copy) => copy.needs_review).length);
    const unmatchedCount = this._count(this._config.unmatched_entity,
      copies.filter((copy) => copy.source === "dekudeals" && copy.collection_present === false).length);
    const attentionCount = copies.filter((copy) => copy.needs_review ||
      (copy.source === "dekudeals" && copy.collection_present === false)).length || Math.max(reviewCount, unmatchedCount);
    const activeCount = this._count(this._config.lent_out_entity, lent.length);
    const unavailable = !collection || !inventory;
    const renderGameCard = (item) => {
      const title = esc(item.name || "Untitled game");
      const image = isHttps(item.image) ? `<img loading="lazy" src="${esc(item.image)}" alt="${title} cover art" />` : '<div class="no-art">Cover art unavailable</div>';
      const description = this._config.show_descriptions && item.description
        ? `<p class="description">${esc(item.description)}</p>` : "";
      return `<article class="game" data-name="${esc(String(item.name || "").toLocaleLowerCase())}" data-platform="${esc(platformKey(item.platform))}" data-format="${esc(String(item.format || "unknown").toLocaleLowerCase())}" data-type="${item.item_type === "dlc" ? "dlc" : "game"}">${image}<div class="game-info"><strong title="${title}">${title}</strong><div class="meta">${esc(item.platform || "Unknown")} · ${esc(item.format || "Format unknown")}</div>${description}</div></article>`;
    };
    const cards = displayItems.map(renderGameCard).join("");
    const groupedItems = new Map();
    displayItems.forEach((item) => {
      const raw = this._collapsedGrouping === "alphabetical" ? (String(item.name || "").trim().charAt(0).toUpperCase().match(/[A-Z]/) || ["#"])[0] : (String(item.platform || "Unknown").trim() || "Unknown");
      if (!groupedItems.has(raw)) groupedItems.set(raw, []);
      groupedItems.get(raw).push(item);
    });
    const collapsedGroups = [...groupedItems.entries()].sort(([a],[b]) => a.localeCompare(b, undefined, {sensitivity:"base",numeric:true})).map(([name, groupItems]) => `<details class="collapsed-group"><summary><strong>${esc(name)}</strong><span>${groupItems.length} ${this._collectionType === "dlc" ? "DLC items" : "games"}</span></summary><div class="grid">${groupItems.map(renderGameCard).join("")}</div></details>`).join("");
    const copyRows = copies.map((copy) => {
      const loan = copy.active_loan;
      const badge = loan ? `<span class="pill loan">With ${esc(loan.borrower)}</span>` :
        copy.needs_review ? '<span class="pill warn">Needs review</span>' : '<span class="pill">In possession</span>';
      const art = isHttps(copy.image) ? `<img class="thumb" src="${esc(copy.image)}" alt="${esc(copy.game)} cover art" loading="lazy">` : '<span class="thumb blank">No art</span>';
      return `<div class="copy-row">${art}<div class="copy-main"><strong>${esc(copy.game)}</strong><small>${esc(copy.platform)} · ${badge}</small>${loan?.due_date ? `<small>Due ${esc(loan.due_date)}</small>` : ""}</div>${loan ? `<button data-action="return" data-copy="${esc(copy.copy_id)}" ${this._busy ? "disabled" : ""}>Return</button>` : `<button data-copy="${esc(copy.copy_id)}" ${this._busy ? "disabled" : ""}>${this._selectedCopy === copy.copy_id ? "Selected" : "Select"}</button>`}</div>`;
    }).join("");
    const loanRows = lent.map((copy) => `<div class="loan-row"><div><strong>${esc(copy.game)}</strong><small>Borrowed by ${esc(copy.active_loan.borrower)} · ${copy.active_loan.due_date ? `Due ${esc(copy.active_loan.due_date)}` : "No due date"}</small></div><button data-action="return" data-copy="${esc(copy.copy_id)}" ${this._busy ? "disabled" : ""}>Return</button></div>`).join("");
    const availableCopies = copies.filter((copy) => !copy.active_loan);
    const loanCopyOptions = availableCopies.map((copy) =>
      `<option value="${esc(copy.copy_id)}" ${this._selectedCopy === copy.copy_id ? "selected" : ""}>${esc(copy.game)} · ${esc(copy.platform)}</option>`
    ).join("");
    const reviewRows = copies.filter((copy) => copy.needs_review || (copy.source === "dekudeals" && copy.collection_present === false))
      .map((copy) => `<div class="review-row"><div><strong>${esc(copy.game)}</strong><small>${esc(copy.review_reason || "Collection match needs confirmation")}</small></div><div class="review-actions"><button data-action="resolve" data-resolution="present" data-copy="${esc(copy.copy_id)}">Present</button><button data-action="resolve" data-resolution="not_present" data-copy="${esc(copy.copy_id)}">Not present</button><button data-action="resolve" data-resolution="manual" data-copy="${esc(copy.copy_id)}">Manual</button></div></div>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family,inherit)}
        ha-card{overflow:hidden;background:var(--ha-card-background,var(--card-background-color));color:var(--primary-text-color)}
        .head{padding:16px 16px 10px}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.heading-actions{display:flex;align-items:center;gap:8px}
        h2{font-size:1.2rem;font-weight:600;margin:0}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
        .stat{background:var(--secondary-background-color);border-radius:10px;padding:9px;min-width:0}
        .stat b{display:block;font-size:1.25rem}.stat span{font-size:.75rem;color:var(--secondary-text-color)}
        nav{display:flex;gap:5px;padding:0 12px 10px;overflow:auto}button,select,input{font:inherit}
        button{border:1px solid var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:8px;padding:7px 10px;cursor:pointer}
        button.active{background:var(--primary-color);color:var(--text-primary-color,#fff);border-color:var(--primary-color)}
        button:disabled{opacity:.5;cursor:wait}
        .toolbar{display:flex;gap:8px;padding:0 16px 12px;flex-wrap:wrap}.toolbar input{flex:1;min-width:130px}
        input,select{border:1px solid var(--divider-color);border-radius:8px;padding:8px;background:var(--card-background-color);color:var(--primary-text-color);min-width:0}
        .grid{display:grid;grid-template-columns:repeat(${this._config.columns},minmax(0,1fr));gap:10px;padding:0 16px 16px}
        .carousel{display:flex;gap:12px;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:x mandatory;padding:0 16px 16px}
        .carousel .game{flex:0 0 clamp(138px,24vw,190px);scroll-snap-align:start}
        .collapsed-group{margin:0 16px 9px;border:1px solid var(--divider-color);border-radius:10px;overflow:hidden}
        .collapsed-group summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;list-style:none;padding:12px;background:var(--secondary-background-color)}
        .collapsed-group summary::-webkit-details-marker{display:none}
        .collapsed-group summary span{font-size:.78rem;color:var(--secondary-text-color)}
        .collapsed-group .grid{padding:10px}
        .game{min-width:0;border:1px solid var(--divider-color);border-radius:10px;overflow:hidden;background:var(--card-background-color)}
        .game img{display:block;box-sizing:border-box;width:100%;aspect-ratio:2/3;padding:8px;object-fit:contain;object-position:center;background:var(--secondary-background-color)}
        .no-art{aspect-ratio:2/3;display:grid;place-items:center;background:var(--secondary-background-color);font-size:2rem}
        .game-info{padding:8px}.game-info strong{display:block;font-size:.88rem;line-height:1.25;overflow-wrap:anywhere}
        .meta,.description,small{color:var(--secondary-text-color);font-size:.75rem}.meta{margin-top:4px}.description{margin:6px 0 0;line-height:1.35}
        .panel{padding:0 16px 16px}.section-title{font-size:.95rem;margin:12px 0 4px}.copy-row,.loan-row,.review-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--divider-color)}
        .thumb{width:42px;height:63px;object-fit:contain;object-position:center;border-radius:5px;background:var(--secondary-background-color)}.thumb.blank{display:grid;place-items:center;background:var(--secondary-background-color)}
        .copy-main,.loan-row>div,.review-row>div:first-child{flex:1;min-width:0}.copy-main strong,.loan-row strong,.review-row strong{display:block}
        small{display:block;margin-top:3px}.pill{display:inline-block;border-radius:20px;padding:2px 7px;background:var(--secondary-background-color)}
        .pill.loan{background:var(--info-color,#2477a8);color:white}.pill.warn{background:var(--warning-color,#a66a00);color:white}
        .loan-form{display:flex;gap:8px;flex-wrap:wrap;padding:12px 0}.loan-form input{flex:1;min-width:120px}
        .review-actions{display:flex;gap:4px;flex-wrap:wrap}.empty,.error{padding:20px 16px;color:var(--secondary-text-color)}
        .foot{padding:0 16px 12px;color:var(--secondary-text-color);font-size:.75rem}
        @media(max-width:520px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.review-row{align-items:flex-start;flex-direction:column}}
      </style>
      <ha-card>
        <div class="head"><div class="heading"><h2>${esc(this._config.title)}</h2><div class="heading-actions"><span class="meta">${gameCount} games · ${dlcCount} DLC</span><button data-action="refresh" ${this._refreshing ? "disabled" : ""}>${this._refreshing ? "Refreshing…" : "Refresh collection"}</button></div></div>
          <div class="stats">
            <div class="stat"><b>${possession}</b><span>In possession</span></div>
            <div class="stat"><b>${activeCount}</b><span>Lent out</span></div>
            <div class="stat"><b>${overdueCount}</b><span>Overdue</span></div>
            <div class="stat"><b>${attentionCount}</b><span>Needs attention</span></div>
          </div>
        </div>
        <nav>
          <button data-view="collection" data-collection-type="game" class="${this._view === "collection" && this._collectionType === "game" ? "active" : ""}">Games (${gameCount})</button><button data-view="collection" data-collection-type="dlc" class="${this._view === "collection" && this._collectionType === "dlc" ? "active" : ""}">DLC (${dlcCount})</button>
          ${this._config.show_inventory ? '<button data-view="inventory" class="' + (this._view === "inventory" ? "active" : "") + '">My copies</button><button data-view="loans" class="' + (this._view === "loans" ? "active" : "") + '">Loans</button><button data-view="review" class="' + (this._view === "review" ? "active" : "") + '">Review</button>' : ""}
        </nav>
        ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
        ${unavailable ? '<div class="error">Waiting for the configured DekuDeals sensors. Check both entity IDs in the card configuration.</div>' :
        this._view === "collection" ? `
          <div class="toolbar"><input id="search" type="search" placeholder="Search ${this._collectionType === "dlc" ? "DLC" : "games"}…" value="${esc(this._query)}">
            <div class="view-switch" role="group" aria-label="Collection view"><button data-layout="grid" class="${this._layout === "grid" ? "active" : ""}">Grid</button><button data-layout="carousel" class="${this._layout === "carousel" ? "active" : ""}">Carousel</button><button data-layout="collapsed" class="${this._layout === "collapsed" ? "active" : ""}">Collapsed</button></div>
            ${this._layout === "collapsed" ? `<select id="collapsed-grouping" aria-label="Group collapsed items"><option value="platform" ${this._collapsedGrouping === "platform" ? "selected" : ""}>Group by platform</option><option value="alphabetical" ${this._collapsedGrouping === "alphabetical" ? "selected" : ""}>Group A–Z</option></select>` : ""}
            <select id="platform"><option value="all">All platforms</option>${platformOptions.replace(/value="([^"]+)"/g, (match, value) => `value="${value}" ${this._platform === value ? "selected" : ""}`)}</select>
            <select id="format"><option value="all">All formats</option><option value="physical" ${this._format === "physical" ? "selected" : ""}>Physical</option><option value="digital" ${this._format === "digital" ? "selected" : ""}>Digital</option></select>
          </div>
          ${displayItems.length ? (this._layout === "carousel" ? '<div class="carousel">' + cards + '</div>' : this._layout === "collapsed" ? collapsedGroups : '<div class="grid">' + cards + '</div>') + '<div class="empty" data-filter-empty hidden>No items match these filters.</div>' : '<div class="empty">No items in this collection view.</div>'}
          <div class="foot">${collection.attributes?.items_truncated ? "The integration has truncated this collection sensor's item list. " : ""}<span data-filter-count>${filtered.length} ${this._collectionType === "dlc" ? "DLC items" : "games"} shown</span> · Cover art and descriptions are supplied by the integration.</div>
        ` : this._view === "inventory" ? `
          <div class="panel">
            <div class="loan-form"><input id="new-game" placeholder="Register a physical game…" value="${esc(this._newGame)}"><select id="new-platform">${platforms.map((platform) => `<option value="${esc(platform)}" ${platformKey(this._newPlatform) === platformKey(platform) ? "selected" : ""}>${esc(platform)}</option>`).join("") || '<option value="Unknown">Unknown</option>'}</select><button data-action="register" ${!this._newGame.trim() || this._busy ? "disabled" : ""}>Add copy</button></div>
            <div class="loan-form"><input id="borrower" placeholder="Borrower name" value="${esc(this._borrower)}"><input id="due-date" type="date" value="${esc(this._dueDate)}"><button data-action="lend-selected" ${!this._selectedCopy || !this._borrower.trim() || this._busy ? "disabled" : ""}>Lend selected copy</button></div>
            ${copyRows.length ? copyRows : '<div class="empty">No physical copies are registered yet. Register one above to get started.</div>'}
          </div>
        ` : this._view === "loans" ? `
          <div class="panel">
            <h3 class="section-title">Create a loan</h3>
            <div class="loan-form">
              <select id="loan-copy" aria-label="Physical copy to lend">
                <option value="">Choose a copy…</option>${loanCopyOptions}
              </select>
              <input id="borrower" placeholder="Borrower name" value="${esc(this._borrower)}" aria-label="Borrower name">
              <input id="due-date" type="date" value="${esc(this._dueDate)}" aria-label="Optional due date">
              <button data-action="lend-selected" ${!this._selectedCopy || !this._borrower.trim() || this._busy ? "disabled" : ""}>Create loan</button>
            </div>
            ${availableCopies.length ? "" : '<div class="foot">All registered copies are currently lent out.</div>'}
            <h3 class="section-title">Active loans</h3>
            ${loanRows.length ? loanRows : '<div class="empty">No games are currently lent out.</div>'}
          </div>`
        : '<div class="panel">' + (reviewRows.length ? reviewRows : '<div class="empty">Nothing needs review.</div>') + '</div>'}
      </ha-card>`;
    this.shadowRoot.removeEventListener("click", this._boundClick);
    this.shadowRoot.removeEventListener("input", this._boundInput);
    this.shadowRoot.removeEventListener("change", this._boundInput);
    this.shadowRoot.addEventListener("click", this._boundClick);
    this.shadowRoot.addEventListener("input", this._boundInput);
    this.shadowRoot.addEventListener("change", this._boundInput);
    this._ensureCopySelection(copies);
    if (this._view === "collection") this._applyCollectionFilters();
  }

  _ensureCopySelection(copies) {
    if (this._selectedCopy && !copies.some((copy) => copy.copy_id === this._selectedCopy)) this._selectedCopy = null;
  }
  _applyCollectionFilters() {
    const cards = [...this.shadowRoot.querySelectorAll(".game")];
    let visible = 0;
    for (const card of cards) {
      const matchesQuery = !this._query || card.dataset.name.includes(this._query.toLocaleLowerCase());
      const matchesPlatform = this._platform === "all" || card.dataset.platform === this._platform;
      const matchesFormat = this._format === "all" || card.dataset.format === this._format;
      const matchesType = card.dataset.type === this._collectionType;
      card.hidden = !(matchesQuery && matchesPlatform && matchesFormat && matchesType);
      if (!card.hidden) visible += 1;
    }
    for (const group of this.shadowRoot.querySelectorAll(".collapsed-group")) {
      const groupCount = group.querySelectorAll(".game:not([hidden])").length;
      group.hidden = groupCount === 0;
      const count = group.querySelector("summary span");
      if (count) count.textContent = `${groupCount} ${this._collectionType === "dlc" ? "DLC items" : "games"}`;
    }
    const foot = this.shadowRoot.querySelector("[data-filter-count]");
    if (foot) foot.textContent = `${visible} ${this._collectionType === "dlc" ? "DLC items" : "games"} shown`;
    const empty = this.shadowRoot.querySelector("[data-filter-empty]");
    if (empty) empty.hidden = visible > 0;
  }

  _handleInput(event) {
    const target = event.target;
    if (target.id === "search") { this._query = target.value; this._applyCollectionFilters(); }
    if (target.id === "platform") { this._platform = target.value; this._applyCollectionFilters(); }
    if (target.id === "format") { this._format = target.value; this._applyCollectionFilters(); }
    if (target.id === "collapsed-grouping") { this._collapsedGrouping = target.value; this._render(); }
    if (target.id === "borrower") this._borrower = target.value;
    if (target.id === "loan-copy") this._selectedCopy = target.value || null;
    if (target.id === "due-date") this._dueDate = target.value;
    if (target.id === "new-game") this._newGame = target.value;
    if (target.id === "new-platform") this._newPlatform = target.value;
    const registerButton = this.shadowRoot.querySelector('[data-action="register"]');
    if (registerButton) registerButton.disabled = !this._newGame.trim() || this._busy;
    const lendButton = this.shadowRoot.querySelector('[data-action="lend-selected"]');
    if (lendButton) lendButton.disabled = !this._selectedCopy || !this._borrower.trim() || this._busy;
  }
  async _call(service, data) {
    if (!this._hass) return;
    this._busy = true; this._render();
    try {
      await this._hass.callService("dekudeals", service, { ...data, ...(this._config.config_entry_id ? { config_entry_id: this._config.config_entry_id } : {}) });
      this._error = "";
    } catch (error) {
      console.error("DekuDeals card service call failed", error);
      this._error = error?.message || "The service call failed. Check Home Assistant logs and service configuration.";
    } finally { this._busy = false; this._render(); }
  }
  async _handleClick(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.dataset.collectionType) this._collectionType = button.dataset.collectionType;
    if (button.dataset.view) { this._view = button.dataset.view; this._render(); return; }
    if (button.dataset.layout) { this._layout = button.dataset.layout; this._render(); return; }
    if (button.dataset.action === "refresh") {
      if (this._refreshing || !this._hass) return;
      this._refreshing = true; this._error = ""; this._render();
      try { await this._hass.callService("dekudeals", "refresh_collection", this._config.config_entry_id ? {config_entry_id:this._config.config_entry_id} : {}); }
      catch (error) { console.error("DekuDeals collection refresh failed", error); this._error = error?.message || "Collection refresh failed. Check Home Assistant logs."; }
      finally { this._refreshing = false; this._render(); }
      return;
    }
    const copyId = button.dataset.copy;
    if (button.dataset.action === "return") { await this._call("return_game", { copy_id: copyId }); return; }
    if (button.dataset.action === "register") {
      if (!this._newGame.trim()) return;
      await this._call("register_copy", { game: this._newGame.trim(), platform: this._newPlatform });
      if (!this._error) this._newGame = "";
      this._render();
      return;
    }
    if (button.dataset.action === "resolve") { await this._call("resolve_inventory_match", { copy_id: copyId, resolution: button.dataset.resolution }); return; }
    if (button.dataset.action === "lend-selected") {
      if (!this._selectedCopy || !this._borrower.trim()) return;
      await this._call("lend_game", { copy_id: this._selectedCopy, borrower: this._borrower.trim(), ...(this._dueDate ? { due_date: this._dueDate } : {}) });
      this._borrower = ""; this._dueDate = ""; this._selectedCopy = null; this._render(); return;
    }
    if (copyId) { this._selectedCopy = copyId; this._render(); }
  }

  static getConfigElement() { return document.createElement("dekudeals-card-editor"); }
  static getStubConfig() { return { collection_entity: "sensor.dekudeals_games", inventory_entity: "sensor.dekudeals_total_physical_copies" }; }
}

class DekuDealsCardEditor extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: "open" }); this._config = {};
  }
  setConfig(config) { this._config = { ...config }; this._render(); }
  set hass(hass) { this._hass = hass; }
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        .field{display:block;margin:10px 0}.field span{display:block;margin-bottom:4px;color:var(--secondary-text-color);font-size:.9rem}
        input:not([type="checkbox"]){box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color);border-radius:6px;background:var(--card-background-color);color:var(--primary-text-color)}
        .toggle{display:flex;align-items:center;gap:8px;margin:12px 0}.toggle input{width:auto}
      </style>
      <label class="field"><span>Collection sensor entity (must expose items)</span><input name="collection_entity" value="${esc(this._config.collection_entity)}" placeholder="sensor.dekudeals_games"></label>
      <label class="field"><span>Physical inventory sensor (must expose copies)</span><input name="inventory_entity" value="${esc(this._config.inventory_entity)}" placeholder="sensor.dekudeals_total_physical_copies"></label>
      <label class="field"><span>Optional lent-out count sensor</span><input name="lent_out_entity" value="${esc(this._config.lent_out_entity)}" placeholder="sensor.dekudeals_games_lent_out"></label>
      <label class="field"><span>Optional overdue count sensor</span><input name="overdue_entity" value="${esc(this._config.overdue_entity)}" placeholder="sensor.dekudeals_games_overdue"></label>
      <label class="field"><span>Optional needs-review count sensor</span><input name="needs_review_entity" value="${esc(this._config.needs_review_entity)}" placeholder="sensor.dekudeals_inventory_needs_review"></label>
      <label class="field"><span>Optional unmatched count sensor</span><input name="unmatched_entity" value="${esc(this._config.unmatched_entity)}" placeholder="sensor.dekudeals_unmatched_physical_games"></label>
      <label class="field"><span>Optional integration config entry ID (for multiple collections)</span><input name="config_entry_id" value="${esc(this._config.config_entry_id)}"></label>
      <label class="field"><span>Card title</span><input name="title" value="${esc(this._config.title || "DekuDeals Collection")}"></label>
      <label class="field"><span>Default collection view</span><select name="view_mode"><option value="grid" ${this._config.view_mode === "carousel" || this._config.view_mode === "collapsed" ? "" : "selected"}>Grid</option><option value="carousel" ${this._config.view_mode === "carousel" ? "selected" : ""}>Carousel</option><option value="collapsed" ${this._config.view_mode === "collapsed" ? "selected" : ""}>Collapsed</option></select></label>
      <label class="field"><span>Collapsed view grouping</span><select name="collapsed_grouping"><option value="platform" ${this._config.collapsed_grouping === "alphabetical" ? "" : "selected"}>By platform</option><option value="alphabetical" ${this._config.collapsed_grouping === "alphabetical" ? "selected" : ""}>Alphabetical (A–Z)</option></select></label>
      <label class="toggle"><input type="checkbox" name="show_inventory" ${this._config.show_inventory !== false ? "checked" : ""}> Show My Copies, Loans, and Review tabs</label>
      <label class="toggle"><input type="checkbox" name="show_descriptions" ${this._config.show_descriptions !== false ? "checked" : ""}> Show game descriptions when available</label>`;
    this.shadowRoot.querySelectorAll("input,select").forEach((input) => input.addEventListener("change", () => {
      const value = input.type === "checkbox" ? input.checked : input.value;
      const config = { ...this._config, [input.name]: value };
      this._config = config;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
    }));
  }
}
if (!customElements.get("dekudeals-card")) customElements.define("dekudeals-card", DekuDealsCard);
if (!customElements.get("dekudeals-card-editor")) customElements.define("dekudeals-card-editor", DekuDealsCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "dekudeals-card", name: "DekuDeals Card", description: "Browse your DekuDeals collection and manage physical copies and loans.", preview: true, documentationURL: "https://github.com/kraroed/lovelace-dekudeals-card", issueURL: "https://github.com/kraroed/lovelace-dekudeals-card/issues", icon: "mdi:gamepad-variant" });
console.info(`%c DEKUDEALS-CARD %c ${CARD_VERSION} `, "color:white;background:#2b6f73;font-weight:bold", "color:#2b6f73;font-weight:bold");
