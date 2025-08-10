// Skill definitions
    const skills = {
      fishing: {
        level: 1,
        xp: 0,
        xpToLevel: 100,
        types: ['Carp', 'Bass', 'Salmon'],
        xpPer: 10,
        duration: 1000
      },
      lumbering: {
        level: 1,
        xp: 0,
        xpToLevel: 100,
        types: ['Oak', 'Birch', 'Spruce'],
        xpPer: 8,
        duration: 1000
      },
      mining: {
        level: 1,
        xp: 0,
        xpToLevel: 100,
        types: ['Stone', 'Coal', 'Iron'],
        xpPer: 12,
        duration: 1000
      },

      smithing: {
        level: 1,
        xp: 0,
        xpToLevel: 100,
        xpPer: 15,         // fallback if a recipe doesn't override xp
        duration: 1500     // fallback if a recipe doesn't override duration
      }

    };
    // Ausgerüsteter Zustand
    window.equippedSlots = window.equippedSlots || {
      head: null, chest: null, legs: null, shoes: null,
      weapon: null, tool: null, offhand: null, backpack: null
    };

    // Per-type smithing recipes
const smithingRecipes = {
  'Iron Bar': {
    consumes: { 'Iron': 1, 'Coal': 1 },
    out: { name: 'Iron Bar', qty: 1, rarity: 'common' },
    time: 1000 // optional, if you want per-recipe override
  }
};



    skills.smithing.types = Object.keys(SMITHING_RECIPES);

    // ---- Config knobs (easy to tweak) ----
    const CFG = {
      TICK_STEPS: 100,          // how many progress steps fill the bar
      LEVEL_GROWTH: 1.5,        // xpToLevel grows by this factor
      SAVE_DEBOUNCE_MS: 500,    // (for later) delay between saves
      RARITY_COLORS: {          // just a central place if you color text later
        common: '#aaa', uncommon: '#7fbf7f', rare: '#4aa3ff',
        epic: '#b36bff', legendary: '#f6b73f', unique: '#ff5e5e'
      }
    };

    const SAVE_KEY = 'idleSave.v1';

    function buildSave() {
      return {
        v: 1,
        skills,
        inventory,
        equippedSlots,
        taskQueue,
        running: running ? {
          skill: runningSkill,
          type: runningType,
          runs: window._runs ?? null
        } : null,
        ts: Date.now()
      };
    }

    function applySave(data) {
      // Minimal guard
      if (!data || data.v !== 1) return;

      // Shallow assign is fine for now
      Object.assign(skills, data.skills || {});
      inventory.loot = { ...(data.inventory?.loot || {}) };
      inventory.equipment = { ...(data.inventory?.equipment || {}) };

      if (data.equippedSlots) {
        Object.assign(equippedSlots, data.equippedSlots);
      }

      taskQueue = Array.isArray(data.taskQueue) ? data.taskQueue : [];

      renderInventory();
      renderEquippedSlots();
      updateSkillButtons();
      refreshTypeTabs?.();
      updateQueueStatus();
    }

    let saveDotTimer = null;
    function showSavedDot() {
      const dot = document.getElementById('saveDot');
      if (!dot) return;
      dot.style.color = '#3cba54'; // green
      clearTimeout(saveDotTimer);
      saveDotTimer = setTimeout(() => {
        dot.style.color = '';
      }, 600);
    }

    function requestSave() {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(buildSave()));
        showSavedDot();
      } catch (e) {
        console.warn('Save failed:', e);
      }
    }

    function tryLoad() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        applySave(data);
      } catch (e) {
        console.warn('Load failed:', e);
      }
    }

    // --- Rarities & item meta ---
    const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "unique"];

    const ITEM_META = {
      Carp: { rarity: "common", category: "loot" },
      Bass: { rarity: "common", category: "loot" },
      Salmon: { rarity: "uncommon", category: "loot" },
      Oak: { rarity: "common", category: "loot" },
      Birch: { rarity: "uncommon", category: "loot" },
      Spruce: { rarity: "uncommon", category: "loot" },
      Stone: { rarity: "common", category: "loot" },
      Coal: { rarity: "uncommon", category: "loot" },
      Iron: { rarity: "uncommon", category: "loot" }
    };

    // --- Per-skill/type droptables ---
    const DROP_TABLES = {
      fishing: {
        Carp: [{ item: "Carp", weight: 80, qty: [1, 1], minLevel: 1 }],
        Bass: [{ item: "Bass", weight: 70, qty: [1, 1], minLevel: 1 }],
        Salmon: [{ item: "Salmon", weight: 60, qty: [1, 1], minLevel: 3 }]
      },
      lumbering: {
        Oak: [{ item: "Oak", weight: 100, qty: [1, 2], minLevel: 1 }],
        Birch: [{ item: "Birch", weight: 80, qty: [1, 1], minLevel: 3 }],
        Spruce: [{ item: "Spruce", weight: 70, qty: [1, 1], minLevel: 5 }]
      },
      mining: {
        Stone: [{ item: "Stone", weight: 100, qty: [1, 2], minLevel: 1 }],
        Coal: [{ item: "Coal", weight: 80, qty: [1, 1], minLevel: 3 }],
        Iron: [{ item: "Iron", weight: 70, qty: [1, 1], minLevel: 5 }]
      }
    };

    // --- Weighted roll ---
    function rollDrop(skillKey, typeName) {
      const lvl = skills[skillKey].level;
      const entries = (DROP_TABLES[skillKey] && DROP_TABLES[skillKey][typeName]) || [];
      const pool = entries.filter(e => (e.minLevel || 1) <= lvl);
      if (!pool.length) return null;

      const total = pool.reduce((a, e) => a + e.weight, 0);
      let r = Math.random() * total, chosen = pool[0];
      for (const e of pool) { r -= e.weight; if (r <= 0) { chosen = e; break; } }

      const [minQ, maxQ] = chosen.qty || [1, 1];
      const qty = Math.floor(minQ + Math.random() * (maxQ - minQ + 1));
      const rarity = (ITEM_META[chosen.item]?.rarity) || "common";

      return { name: chosen.item, qty, rarity };
    }


    // State variables
    let currentSkill = null;
    let currentType = null;
    let runningSkill = null;
    let runningType = null;
    let running = false;
    let intervalId = null;
    let taskQueue = [];

    // Inventory store
    const inventory = {
      loot: {},
      equipment: {}
    };

    function normalizeLootShape() {
      Object.entries(inventory.loot).forEach(([name, val]) => {
        if (typeof val === 'number') {
          inventory.loot[name] = { qty: val, rarity: 'common' };
        }
      });
    }


    
    const equippedSlots = window.equippedSlots;

    // --- Persistence adapter ---
    const Persistence = (() => {
      const KEY = 'idle.save.v1';
      const VERSION = 1;

      function save(state) {
        try {
          localStorage.setItem(KEY, JSON.stringify({ version: VERSION, state }));
        } catch (e) {
          console.warn('save failed', e);
        }
      }

      function load() {
        try {
          const raw = localStorage.getItem(KEY);
          if (!raw) return null;
          const data = JSON.parse(raw);
          return (data && data.state) ? data.state : null;
        } catch (e) {
          console.warn('load failed', e);
          return null;
        }
      }

      function reset() { localStorage.removeItem(KEY); }

      return { save, load, reset, KEY, VERSION };
    })();

    let _saveTimer = null;
    function requestSave() {
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => Persistence.save(collectState()), 400);
    }

    function collectState() {
      return {
        skills,
        inventory,
        equippedSlots,
      };
    }

    function applyState(s) {
      if (!s) return;

      if (s.skills) {
        for (const k in s.skills) if (skills[k]) Object.assign(skills[k], s.skills[k]);
      }
      if (s.inventory) {
        inventory.loot = s.inventory.loot || {};
        inventory.equipment = s.inventory.equipment || {};
      }
      if (s.equippedSlots) {
        Object.assign(equippedSlots, s.equippedSlots);
      }
    }



    // Welche Items passen in welchen Slot (simple Demo-Regeln)
    // Optional: simple Regeln je Slot (alles erlaubt, wenn nicht definiert)
    window.equipRules = window.equipRules || {
      head: n => /helm|hat|cap/i.test(n),
      chest: n => /chest|armor|brust/i.test(n),
      legs: n => /legs|hose|pants/i.test(n),
      shoes: n => /shoe|boots|schuh/i.test(n),
      weapon: n => /sword|axe|bow|waffe/i.test(n),
      tool: n => /pickaxe|hammer|werkzeug/i.test(n),
      offhand: n => /shield|buckler|offhand/i.test(n),
      backpack: n => /rucksack|bag|pack/i.test(n)
    };

    // DOM references
    const characterSelection = document.getElementById('characterSelection');
    const charBoxes = document.querySelectorAll('.charBox');
    const skillsAside = document.getElementById('skills');
    const gameplaySec = document.getElementById('gameplay');
    const characterAside = document.getElementById('character');
    const charMenuBtn = document.getElementById('charMenuBtn');
    const skillBtns = document.querySelectorAll('.skillBtn');
    const typeTabs = document.getElementById('typeTabs');
    const controls = document.getElementById('controls');
    const startBtn = document.getElementById('startBtn');
    const queueBtn = document.getElementById('queueBtn');
    const progressStopBtn = document.getElementById('progressStopBtn');
    const progressStopAllBtn = document.getElementById('progressStopAllBtn');
    const repeatCount = document.getElementById('repeatCount');
    const info = document.getElementById('info');
    const progressBar = document.getElementById('progressBar');
    const progressOverlay = document.getElementById('progressOverlay');
    const lootList = document.getElementById('lootList');
    const equipList = document.getElementById('equipList');
    const rightTabs = document.querySelectorAll('.tabRightBtn');
    const tabContents = document.querySelectorAll('.tabContent');

    // Modal-Refs
    const gearModal = document.getElementById('gearModal');
    const gearModalTitle = document.getElementById('gearModalTitle');
    const gearModalClose = document.getElementById('gearModalClose');
    const gearList = document.getElementById('gearList');

    normalizeLootShape();
    renderInventory();

    // --- Load save (if any) and render ---
    applyState(Persistence.load());
    renderInventory();
    equippedSlots();
    updateSkillButtons();
    refreshTypeTabs();
    updateQueueStatus();
    requestSave();

    // Save on tab close as a safety net
    window.addEventListener('beforeunload', () => {
      try { Persistence.save(collectState()); } catch { }
    });

    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const resetBtn = document.getElementById('resetBtn');

    exportBtn?.addEventListener('click', () => {
      requestSave(); // ensure latest state
      const raw = localStorage.getItem(SAVE_KEY) || '{}';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'idle_save.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    importBtn?.addEventListener('click', () => importFile?.click());
    importFile?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          applySave(data);
        } catch {
          alert('Invalid save file.');
        } finally {
          importFile.value = '';
        }
      };
      r.readAsText(file);
    });


resetBtn.addEventListener('click', () => {
  if (!confirm('Reset all progress?')) return;

  // stop any running task
  if (intervalId) clearInterval(intervalId);
  running = false;
  taskQueue = [];
  runningSkill = null;
  runningType  = null;

  // reset skills
  Object.keys(skills).forEach(k => {
    skills[k].level     = 1;
    skills[k].xp        = 0;
    skills[k].xpToLevel = 100;
  });

  // reset inventory (replace objects, don't null-out entries)
  inventory.loot = {};
  inventory.equipment = {};

  // reset equipped slots
  Object.keys(equippedSlots).forEach(k => { equippedSlots[k] = null; });

  // clear persisted save
  try { localStorage.removeItem(SAVE_KEY); } catch {}

  // reset UI
  progressBar.value = 0;
  progressOverlay.textContent = 'Aktuelle Task: - | Warteschlange: 0';
  typeTabs.innerHTML = '';
  info.innerHTML = '';

  renderInventory();
  equippedSlots();
  updateSkillButtons();
  refreshTypeTabs?.();
  updateQueueStatus();

  // back to character selection
  showMainMenu();
});



    // Show game UI
    function enterGame() {
      // Rebuild currently open skill (if any) so locks reflect new level
      if (currentSkill) { loadSkill(currentSkill); }
      characterSelection.classList.add('hidden');
      skillsAside.classList.remove('hidden');
      gameplaySec.classList.remove('hidden');
      characterAside.classList.remove('hidden');
      charMenuBtn.style.display = 'block';
      updateSkillButtons();
      refreshSkillUnlocks();
      updateQueueStatus();
      renderInventory();
    }

    tryLoad()
    requestSave()

    // Return to character selection
    function showMainMenu() {
      characterSelection.classList.remove('hidden');
      skillsAside.classList.add('hidden');
      gameplaySec.classList.add('hidden');
      characterAside.classList.add('hidden');
      document.getElementById('charHeader').innerText = 'Charakter: -';
    }

    // Back button handler
    charMenuBtn.addEventListener('click', showMainMenu);

    // Character box click handlers
    charBoxes.forEach(box => {
      box.addEventListener('click', () => {
        const sel = box.dataset.char;

        // Set starting level for each class
        if (sel === 'Mensch') {
          skills.lumbering.level = 3;
          skills.lumbering.xp = 0;
        } else if (sel === 'Nymph') {
          skills.fishing.level = 3;
          skills.fishing.xp = 0;
        } else if (sel === 'Zwerg') {
          skills.mining.level = 3;
          skills.mining.xp = 0;
        }
        refreshSkillUnlocks();
        // Update header and switch to game UI
        document.getElementById('charHeader').innerText = `Charakter: ${sel}`;
        enterGame();
      });
    });

    // Update the queue button label/state
    function updateQueueButton() {
      if (taskQueue.length >= 1) {
        queueBtn.textContent = 'Max Reached';
        queueBtn.disabled = true;
      } else {
        queueBtn.textContent = 'Queue Next';
        queueBtn.disabled = false;
      }
    }

    // Update the bottom status bar
    function updateQueueStatus() {
      // Berechne Restzeit der aktuellen Task
      let timeLabel = '–';
      if (runningSkill) {
        const runs = window._runs;                // Wert aus runTask()
        const dur = skills[runningSkill].duration; // Dauer pro Durchlauf in ms
        timeLabel = runs === Infinity
          ? '∞'
          : ((runs * dur) / 1000).toFixed(1) + 's';
      }
      progressOverlay.textContent =
        `Aktuelle Task: ${runningSkill || '-'} | Restzeit: ${timeLabel} | Warteschlange: ${taskQueue.length}`;
      updateQueueButton();
    }

    // Refresh all skill button labels
    function updateSkillButtons() {
      skillBtns.forEach(b => {
        b.querySelector('.lvl').textContent =
          'Lv ' + skills[b.dataset.skill].level;
      });
    }

    function refreshSkillUnlocks() {
      const smithBtn = document.querySelector('.skillBtn[data-skill="smithing"]');
      if (!smithBtn) return;
      const unlocked = skills.mining?.level >= 3;
      smithBtn.disabled = !unlocked;
      smithBtn.title = unlocked ? '' : 'Benötigt Bergbau Lv 3';
      smithBtn.style.opacity = unlocked ? '1' : '0.6';
    }

    // Unlock type tabs when skill levels up
    function refreshTypeTabs() {
      if (!currentSkill) return;
      const s = skills[currentSkill];
      Array.from(typeTabs.children).forEach((b, i) => {
        const req = i === 1 ? 3 : i === 2 ? 5 : 1;
        if (s.level >= req && b.disabled) {
          b.disabled = false;
          b.classList.remove('disabled');
          b.textContent = b.textContent.split(' 🔒')[0];
        }
      });
    }

    // Skill tab click handlers
    skillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        skillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadSkill(btn.dataset.skill);
      });
    });

    // Load a given skill view
    function loadSkill(skill) {
      currentSkill = skill;
      currentType = null;
      controls.style.display = 'none';
      startBtn.disabled = queueBtn.disabled = true;
      typeTabs.innerHTML = '';
      info.innerHTML = '';
      updateQueueStatus();

      const s = skills[skill];
      s.types.forEach((t, i) => {
        const b = document.createElement('button');
        b.className = 'tabBtn';
        const req = i === 1 ? 3 : i === 2 ? 5 : 1;
        let lbl = t;
        if (s.level < req) {
          b.disabled = true;
          b.classList.add('disabled');
          lbl += ` 🔒${req}`;
        }
        b.textContent = lbl;
        b.addEventListener('click', () => selectType(t, b));
        typeTabs.appendChild(b);
      });

      updateSkillButtons();
    }

    // Handle type selection in the skill view
    function selectType(type, btn) {
      typeTabs.querySelectorAll('.tabBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = type;
      controls.style.display = 'block';
      startBtn.disabled = queueBtn.disabled = false;

      const d = skills[currentSkill];
      if (currentSkill === 'smithing') {
  const rec = SMITHING_RECIPES[type];
  const dur = ((rec?.duration ?? d.duration) / 1000).toFixed(1);
  const xp  = (rec?.xp ?? d.xpPer);

  const inputs = Object.entries(rec.consumes)
    .map(([n, q]) => `${q}× ${n}`).join(', ');

  const out    = rec.output;
  const outputs = `${out.qty}× ${out.name} (${out.rarity || 'common'})`;

  info.innerHTML = `XP: ${xp}<br>Dauer: ${dur}s<br>Inputs: ${inputs}<br>Result: ${outputs}`;
}  else {
        const d = skills[currentSkill];
        info.innerHTML =
          `XP: ${d.xpPer}<br>` +
          `Dauer: ${(d.duration / 1000).toFixed(1)}s<br>` +
          `Drop: ${type}`;
      }
    }


    function addItem(category, name, qty = 1, rarity = null) {
      if (!inventory[category]) inventory[category] = {};

      if (category === 'loot') {
        const prev = inventory.loot[name];

        // If old numeric style exists, upgrade it to object style
        if (typeof prev === 'number') {
          inventory.loot[name] = { qty: prev, rarity: 'common' };
        }

        const rec = inventory.loot[name] || { qty: 0, rarity: rarity || 'common' };
        rec.qty += qty;
        if (!rec.rarity) rec.rarity = rarity || 'common';
        inventory.loot[name] = rec;
      } else {
        // equipment stays as simple counts
        inventory[category][name] = (inventory[category][name] || 0) + qty;
      }

      renderInventory();
      requestSave();
    }


    function renderInventory() {
  // --- Loot ---
  lootList.innerHTML = '';
  Object.entries(inventory.loot || {}).forEach(([name, meta]) => {
    // meta may be {qty, rarity} OR a plain number, or even null after a buggy reset
    const qty    = (meta && typeof meta === 'object') ? (meta.qty ?? 0) : (meta ?? 0);
    const rarity = (meta && typeof meta === 'object' && meta.rarity) ? meta.rarity : 'common';
    if (qty <= 0) return; // skip empty
    const li = document.createElement('li');
    li.textContent = `${name} (${rarity}): ${qty}`;
    lootList.appendChild(li);
  });

  // --- Equipment ---
  equipList.innerHTML = '';
  Object.entries(inventory.equipment || {}).forEach(([name, qty]) => {
    if (!qty) return;
    const li = document.createElement('li');
    li.textContent = `${name}: ${qty}`;
    equipList.appendChild(li);
  });
}


    function renderEquippedSlots() {
      const placeholders = {
        head: 'Kopf', chest: 'Brust', legs: 'Beine', shoes: 'Schuhe',
        weapon: 'Waffe', tool: 'Werkzeug', offhand: 'Offhand', backpack: 'Rucksack'
      };

      document.querySelectorAll('.equip-slot').forEach(slotEl => {
        const key = slotEl.dataset.slot;
        const name = equippedSlots[key];
        console.log('Render slot', key, 'value:', name);
        slotEl.textContent = name ? name : (placeholders[key] || key);
        slotEl.style.opacity = name ? '1' : '.85';
      });
    }

    function equipItem(slotKey, name) {
      if (!inventory.equipment[name]) return;

      // Aus Inventar nehmen
      inventory.equipment[name]--;
      if (inventory.equipment[name] <= 0) delete inventory.equipment[name];

      // Falls im Slot schon was steckt → zurück ins Inventar
      if (equippedSlots[slotKey]) {
        const prev = equippedSlots[slotKey];
        inventory.equipment[prev] = (inventory.equipment[prev] || 0) + 1;
      }

      // Setzen
      equippedSlots[slotKey] = name;

      // UI
      renderInventory();
      equippedSlots();
      requestSave();
    }

    function unequipItem(slotKey) {
      const name = equippedSlots[slotKey];
      if (!name) return;

      // Zurück ins Inventar
      inventory.equipment[name] = (inventory.equipment[name] || 0) + 1;
      equippedSlots[slotKey] = null;

      // UI
      renderInventory();
      equippedSlots();
      requestSave();
    }


    function getItemSlotByName(name) {
      const n = name.toLowerCase();
      if (/(helm|hat)/i.test(n)) return 'head';
      if (/(chest|brust|armor|platte|robe)/i.test(n)) return 'chest';
      if (/(legs|hose|greaves|beine)/i.test(n)) return 'legs';
      if (/(boots|schuhe|stiefel)/i.test(n)) return 'shoes';
      if (/(sword|schwert|axe|axt|mace|hammer|bogen|bow|stab|staff)/i.test(n)) return 'weapon';
      if (/(tool|werkzeug|pickaxe|spitzhacke|hatchet|hacke|rod|rute|angelrute)/i.test(n)) return 'tool';
      if (/(shield|schild|torch|fackel|buch|book|orb|talisman)/i.test(n)) return 'offhand';
      if (/(backpack|rucksack|bag)/i.test(n)) return 'backpack';
      return null;
    }

    function getCompatibleEquipmentFor(slotKey) {
      const out = [];
      const eq = inventory.equipment || {};
      Object.entries(eq).forEach(([name, qty]) => {
        if (qty > 0 && getItemSlotByName(name) === slotKey) out.push({ name, qty });
      });
      return out;
    }

    function closeGearModal() {
      gearModal.classList.add('hidden');
    }

    function openGearModal(slotKey, anchorEl) {
      gearModalTitle.textContent = `Slot: ${slotKey}`;
      gearList.innerHTML = '';           // clear once at the beginning
      gearModal.dataset.slot = slotKey;

      // Unequip section (only if something is equipped)
      const equippedName = equippedSlots[slotKey];
      if (equippedName) {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '8px';
        wrap.innerHTML = `
      <div style="margin-bottom:6px;opacity:.9;">
        Aktuell: <strong>${equippedName}</strong>
      </div>
    `;

        const btnUnequip = document.createElement('button');
        btnUnequip.textContent = 'Unequip';
        btnUnequip.style.cssText =
          'margin-bottom:8px; padding:6px 10px; border-radius:4px; background:#d9534f; color:#fff; border:none; cursor:pointer;';
        btnUnequip.addEventListener('click', () => {
          unequipItem(slotKey);
          closeGearModal();
          requestSave();
        });

        wrap.appendChild(btnUnequip);
        gearList.appendChild(wrap);
      }

      // Build options (do NOT clear gearList again here)
      const options = getCompatibleEquipmentFor(slotKey);
      if (options.length === 0) {
        const none = document.createElement('div');
        none.style.opacity = '.8';
        none.textContent = 'Kein passendes Item im Inventar.';
        gearList.appendChild(none);
      } else {
        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.textContent = `${opt.name} (${opt.qty})`;
          btn.className = 'gear-opt';
          btn.style.cssText =
            'width:100%; text-align:left; margin:4px 0; padding:6px; background:#4a4c4f; color:#ddd; border:1px solid #555; border-radius:4px; cursor:pointer;';
          btn.addEventListener('click', () => {
            equippedSlots(slotKey, opt.name);
            closeGearModal();
            requestSave();
          });
          gearList.appendChild(btn);
        });
      }

      // Modal sichtbar & bei Slot positionieren (falls du das nutzt)
      gearModal.classList.remove('hidden');
      const container = document.getElementById('character');
      const cRect = container.getBoundingClientRect();
      const sRect = anchorEl.getBoundingClientRect();
      let top = (sRect.bottom - cRect.top) + container.scrollTop + 6;
      let left = (sRect.left - cRect.left) + container.scrollLeft;
      const mW = gearModal.offsetWidth, mH = gearModal.offsetHeight;
      const maxLeft = container.clientWidth - mW - 8;
      const maxTop = container.clientHeight - mH - 8;
      if (left > maxLeft) left = Math.max(0, maxLeft);
      if (top > maxTop) top = Math.max(0, maxTop);
      gearModal.style.left = left + 'px';
      gearModal.style.top = top + 'px';
    }

    // --- smithing helpers ---
function getLootQty(name) {
  const n = Number(inventory.loot?.[name]);
  return Number.isFinite(n) ? n : 0;
}
function addLoot(name, delta) {
  const cur = getLootQty(name);
  const next = Math.max(0, cur + delta);
  if (!inventory.loot) inventory.loot = {};
  inventory.loot[name] = next;
}

function canConsume(recipe) {
  // recipe = { Iron: 1, Coal: 1 }
  for (const [mat, need] of Object.entries(recipe)) {
    if (getLootQty(mat) < need) return false;
  }
  return true;
}
function tryConsume(recipe) {
  if (!canConsume(recipe)) return false;
  for (const [mat, need] of Object.entries(recipe)) addLoot(mat, -need);
  renderInventory(); // live UI update
  return true;
}
function maxCraftable(recipe) {
  let max = Infinity;
  for (const [mat, need] of Object.entries(recipe)) {
    const have = getLootQty(mat);
    max = Math.min(max, Math.floor(have / need));
  }
  return max;
}

function hasIngredients(recipe) {
  return Object.entries(recipe.consumes).every(([name, qty]) =>
    (inventory.loot[name] || 0) >= qty
  );
}

function consumeIngredients(recipe) {
  Object.entries(recipe.consumes).forEach(([name, qty]) => {
    inventory.loot[name] = (inventory.loot[name] || 0) - qty;
    if (inventory.loot[name] <= 0) delete inventory.loot[name];
  });
  renderInventory && renderInventory();
}


    // Core task runner
    function runTask(skill, type, count) {
      if (running && (skill !== runningSkill || type !== runningType)) {
        clearInterval(intervalId);
        running = false;
        taskQueue = [];
        updateQueueStatus();
      }

      let runs = count;
      window._runs = runs;

      const d = skills[skill];
      const step = d.duration / CFG.TICK_STEPS;

      // If this task consumes inputs, cap runs by what's actually craftable
let recipe = null;


      running = true;
      runningSkill = skill;
      runningType = type;
      updateQueueStatus();

      (function iter() {
        window._runs = runs;
        let pct = 0;
        progressBar.value = 0;

        intervalId = setInterval(() => {
          pct++;
          progressBar.value = pct;
          // ...

          pct++;
          progressBar.value = pct;

          const remainingMs = runs === Infinity
            ? Infinity
            : (runs - 1) * d.duration + (100 - pct) * step;
          const timeLabel = runs === Infinity ? '∞' : (remainingMs / 1000).toFixed(1) + 's';
          progressOverlay.textContent = `Aktuelle Task: ${skill}→${type} | Restzeit: ${timeLabel} | Warteschlange: ${taskQueue.length}`;

          if (pct >= 100) {
            clearInterval(intervalId);
            // consume inputs first (for smithing-type tasks)
            if (recipe) {
            if (!tryConsume(recipe)) {
                // ran out of mats mid-run
                running = false;
                runningSkill = runningType = null;
                progressOverlay.textContent = 'Not enough materials.';
                processQueue();
                updateQueueStatus();
                return;
            }
            }

            // now award the output
            const drop = (typeof rollDrop === 'function')
            ? rollDrop(skill, type)
            : { name: type, qty: 1, rarity: 'common' };

            if (drop) {
            addItem('loot', drop.name, drop.qty, drop.rarity);
            }

            const s = skills[skill];
            s.xp += s.xpPer;
            while (s.xp >= s.xpToLevel) {
              s.xp -= s.xpToLevel;
              s.level++;
              s.xpToLevel *= 1.5;
              updateSkillButtons();
              refreshSkillUnlocks();
              refreshTypeTabs();
            }

            // === Award / consume results ===
if (skill === 'smithing') {
  const recipe = smithingRecipes[type];
  if (!recipe) {
    console.warn('No recipe for', type);
  } else {
    // Double-check you still have mats
    if (!hasIngredients(recipe)) {
      // Stop gracefully if mats ran out mid-queue
      running = false;
      runningSkill = runningType = null;
      progressOverlay.textContent = 'Not enough materials.';
      updateQueueStatus();
      processQueue();
      return;
    }
    // Consume inputs and add output
    consumeIngredients(recipe);
    addItem('loot', recipe.out.name, recipe.out.qty, recipe.out.rarity || 'common');
    requestSave && requestSave(); // optional, if you wired it
  }
} else {
  // Normal skilling drop
  const drop = rollDrop(skill, type);   // uses your rarity tables
  if (drop) addItem('loot', drop.name, drop.qty, drop.rarity);
  requestSave && requestSave(); // optional
}



            requestSave();

            if (runs === Infinity || --runs > 0) {
              iter();
            } else {
              running = false;
              runningSkill = runningType = null;
              progressOverlay.textContent = '';
              processQueue();
              updateQueueStatus();
            }
          }
        }, step);
      })();
    }
    // Process next queued task
    function processQueue() {
      if (running || !taskQueue.length) return;
      const nxt = taskQueue.shift();
      runTask(nxt.skill, nxt.type, nxt.count);
    }

    // Start button handler
    startBtn.addEventListener('click', () => {
      if (running && currentSkill === runningSkill && currentType === runningType) return;
      const v = parseInt(repeatCount.value);
      const c = isNaN(v) ? Infinity : v;
      runTask(currentSkill, currentType, c);
      updateQueueStatus();
      startBtn.disabled = true;
    });

    // Queue button handler
    queueBtn.addEventListener('click', () => {
      if (taskQueue.length >= 1) return;
      const v = parseInt(repeatCount.value);
      const c = isNaN(v) ? Infinity : v;
      taskQueue.push({ skill: currentSkill, type: currentType, count: c });
      updateQueueStatus();
    });

    // Stop buttons
    progressStopBtn.addEventListener('click', () => {
      if (running) {
        clearInterval(intervalId);
        running = false;
        startBtn.disabled = false;
        processQueue();
        updateQueueStatus();
      }
    });

    progressStopAllBtn.addEventListener('click', () => {
      if (running) {
        clearInterval(intervalId);
        running = false;
      }
      taskQueue = [];
      updateQueueStatus();
      startBtn.disabled = false;
    });

    // Right sidebar tab switching
    rightTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        // Tabs umschalten
        rightTabs.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');

        const target = document.getElementById(btn.dataset.tab);
        target.classList.add('active');

        // WICHTIG: Inventar neu rendern, sobald es angezeigt wird
        if (btn.dataset.tab === 'inventory') renderInventory();
        if (btn.dataset.tab === 'equipment') equippedSlots();
      });
    });

    const hasSave = !!localStorage.getItem(SAVE_KEY);
    const urlHasSeedFlag = window.location.search.includes('seed');
    const shouldSeed = !hasSave && urlHasSeedFlag;

    if (shouldSeed) {
      // Test-Equipment
      inventory.equipment['Rusty Helm'] = (inventory.equipment['Rusty Helm'] || 0) + 1;
      inventory.equipment['Leather Chestplate'] = (inventory.equipment['Leather Chestplate'] || 0) + 1;
      inventory.equipment['Old Boots'] = (inventory.equipment['Old Boots'] || 0) + 1;
      inventory.equipment['Iron Sword'] = (inventory.equipment['Iron Sword'] || 0) + 1;
      inventory.equipment['Basic Pickaxe'] = (inventory.equipment['Basic Pickaxe'] || 0) + 1;
      inventory.equipment['Wooden Shield'] = (inventory.equipment['Wooden Shield'] || 0) + 1;
      inventory.equipment['Small Backpack'] = (inventory.equipment['Small Backpack'] || 0) + 1;

      // Optional starter loot
      inventory.loot['Carp'] = (inventory.loot['Carp'] || 0) + 3;
      inventory.loot['Oak'] = (inventory.loot['Oak'] || 0) + 2;
      inventory.loot['Stone'] = (inventory.loot['Stone'] || 0) + 5;
    }

    // Initial status update
    updateQueueStatus();// UI aktualisieren
    renderInventory();
    equippedSlots();
    // Slot Events

    // Modal schließen
    gearModalClose.addEventListener('click', closeGearModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeGearModal();
    });
    document.addEventListener('click', (e) => {
      if (!gearModal.classList.contains('hidden')) {
        if (!gearModal.contains(e.target) && !e.target.classList.contains('equip-slot')) {
          closeGearModal();
        }
      }
    });


    document.querySelectorAll('.equip-slot').forEach(el => {
      el.addEventListener('click', () => openGearModal(el.dataset.slot, el));
      el.addEventListener('contextmenu', e => { e.preventDefault(); unequipItem(el.dataset.slot); });
    });

    // Quick env check – run __devCheck() in the console
    window.__devCheck = function () {
      const checks = {
        addItem: typeof addItem === 'function',
        rollDrop: typeof rollDrop === 'function',
        requestSave: typeof requestSave === 'function',
        renderInventory: typeof renderInventory === 'function',
        renderEquippedSlots: typeof renderEquippedSlots === 'function',
        runTask: typeof runTask === 'function',
      };
      console.table(checks);
      return checks;
    };

    console.log('charBoxes count:', document.querySelectorAll('.charBox').length);


    // Quick drop-table tester (optional)
    function testDrops(skill, type, n = 5000) {
      const byName = Object.create(null);
      const byRarity = Object.create(null);
      for (let i = 0; i < n; i++) {
        const d = rollDrop(skill, type);
        if (!d) continue;
        byName[d.name] = (byName[d.name] || 0) + d.qty;
        byRarity[d.rarity] = (byRarity[d.rarity] || 0) + d.qty;
      }
      console.log(`=== ${skill} / ${type} (${n} rolls) ===`);
      console.table(byRarity);
      console.table(byName);
    }
    // Initialize to main menu
    showMainMenu();
