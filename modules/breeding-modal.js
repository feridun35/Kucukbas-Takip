/**
 * ShepherdAI — Koç Katımı / Eşleşme Modalı
 * Bireysel ve Grup eşleşme kaydı oluşturma arayüzü.
 * core/breedingManager.js fonksiyonlarını çağırır, doğrudan state yazar.
 */

import { getState, setState } from '../core/state.js';
import { createMatingRecord, checkInbreedingRisk, syncBreedingTasks, calculateCompatibility } from '../core/breedingManager.js';
import { addTask } from '../core/workforceManager.js';

// ═══════════════════════════════════════════════════════════
// Ana Modal Açma Fonksiyonu
// ═══════════════════════════════════════════════════════════
/**
 * Koç katımı modalını açar.
 * @param {string|null} preselectedDamId — Hayvan profilinden geliniyorsa önceden seçili koyun
 * @returns {Promise<{saved: boolean}>}
 */
export function openBreedingModal(preselectedDamId = null) {
  return new Promise((resolve) => {
    const state = getState();
    const animals = state.animals || [];

    const males = animals.filter(a => a.gender === 'Erkek');
    const females = animals.filter(a => a.gender === 'Dişi');

    // Gebe olmayan dişiler (aktif breedingRecords kontrolü)
    const activeBreedingDamIds = new Set();
    (state.breedingRecords || []).forEach(r => {
      if (r.status === 'ACTIVE' || r.status === 'PREGNANT') {
        r.damIds.forEach(id => activeBreedingDamIds.add(id));
      }
    });
    const availableFemales = females.filter(a => !activeBreedingDamIds.has(a.id));

    // Modal container
    let modalContainer = document.getElementById('breeding-modal-root');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'breeding-modal-root';
      document.body.appendChild(modalContainer);
    }

    let activeTab = 'individual';
    let selectedSireId = males.length > 0 ? males[0].id : null;
    let selectedDamId = preselectedDamId || (availableFemales.length > 0 ? availableFemales[0].id : null);
    let selectedGroupSires = new Set();
    let selectedGroupDams = new Set(availableFemales.map(a => a.id)); // Tüm boş dişiler varsayılan
    let matingDate = new Date().toISOString().split('T')[0];
    let groupEndDate = '';
    let inbreedingResult = { hasRisk: false, relation: null, details: null };

    function _renderModal() {
      // Bireysel sekmede inbreeding kontrolü
      if (activeTab === 'individual' && selectedDamId && selectedSireId) {
        inbreedingResult = checkInbreedingRisk(selectedDamId, selectedSireId, animals);
      }

      const compatScore = (activeTab === 'individual' && selectedDamId && selectedSireId)
        ? calculateCompatibility(selectedDamId, selectedSireId, state.focusMode || 'meat')
        : null;

      modalContainer.innerHTML = `
        <div class="c-modal-overlay active" id="breeding-modal-overlay">
          <div class="c-modal-box" style="max-height:90vh; overflow-y:auto; max-width:460px; width:92%;">
            <div class="c-modal-icon">🐏</div>
            <h3 class="c-modal-title" style="margin-bottom:12px;">Koç Katımı / Eşleşme Kaydı</h3>

            <!-- Sekme Butonları -->
            <div class="breeding-modal-tabs" style="display:flex; gap:8px; margin-bottom:16px;">
              <button class="breeding-modal-tab ${activeTab === 'individual' ? 'active' : ''}" data-tab="individual"
                style="flex:1; padding:10px; border-radius:12px; border:1px solid ${activeTab === 'individual' ? 'var(--accent-orange)' : 'rgba(255,255,255,0.1)'}; 
                background:${activeTab === 'individual' ? 'rgba(249,115,22,0.15)' : 'var(--glass-bg)'}; 
                color:${activeTab === 'individual' ? 'var(--accent-orange)' : 'var(--text-secondary)'}; 
                font-weight:600; cursor:pointer; font-size:0.85rem; transition:0.2s;">
                🐑 Bireysel Eşleşme
              </button>
              <button class="breeding-modal-tab ${activeTab === 'group' ? 'active' : ''}" data-tab="group"
                style="flex:1; padding:10px; border-radius:12px; border:1px solid ${activeTab === 'group' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.1)'}; 
                background:${activeTab === 'group' ? 'rgba(168,85,247,0.15)' : 'var(--glass-bg)'}; 
                color:${activeTab === 'group' ? 'var(--accent-purple)' : 'var(--text-secondary)'}; 
                font-weight:600; cursor:pointer; font-size:0.85rem; transition:0.2s;">
                🐏 Grup Koç Katımı
              </button>
            </div>

            <!-- İçerik -->
            ${activeTab === 'individual' ? _renderIndividualTab(males, availableFemales, selectedSireId, selectedDamId, matingDate, inbreedingResult, compatScore) : _renderGroupTab(males, availableFemales, selectedGroupSires, selectedGroupDams, matingDate, groupEndDate)}

            <!-- Aksiyon Butonları -->
            <div class="c-modal-actions" style="display:flex; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="btn-breeding-cancel" style="flex:1;">İptal</button>
              <button class="btn-primary" id="btn-breeding-save" style="flex:1; background:${activeTab === 'individual' ? '#f97316' : '#a855f7'}; font-weight:700;">
                ✅ Eşleşme Kaydet
              </button>
            </div>
          </div>
        </div>
      `;

      _attachEvents();
    }

    function _renderIndividualTab(males, females, sireId, damId, date, ibResult, compat) {
      const sireOptions = males.map(m => `<option value="${m.id}" ${m.id === sireId ? 'selected' : ''}>${m.id} — ${m.breed || ''} ${m.type || ''}</option>`).join('');
      const damOptions = females.map(f => `<option value="${f.id}" ${f.id === damId ? 'selected' : ''}>${f.id} — ${f.breed || ''} ${f.type || ''}</option>`).join('');

      const inbreedingAlert = ibResult.hasRisk ? `
        <div class="breeding-inbreeding-alert" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); border-radius:12px; padding:12px; margin:12px 0;">
          <div style="font-weight:700; color:#ef4444; font-size:0.9rem; margin-bottom:4px;">🚨 AKRABALIK RİSKİ: ${ibResult.relation}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary); line-height:1.4;">${ibResult.details}</div>
          <div style="font-size:0.75rem; color:#fbbf24; margin-top:6px; font-weight:600;">⚠️ Akraba eşleşmesi verim ve sağlık düşüklüğüne yol açabilir.</div>
        </div>
      ` : '';

      const compatHtml = compat !== null ? `
        <div style="text-align:center; margin:8px 0;">
          <span style="font-size:0.75rem; color:var(--text-muted);">Genetik Uyum:</span>
          <span style="font-size:1.1rem; font-weight:700; color:${compat >= 70 ? 'var(--accent-green)' : compat >= 50 ? 'var(--accent-amber)' : 'var(--danger-red)'}; margin-left:6px;">%${compat}</span>
        </div>
      ` : '';

      return `
        <div style="text-align:left;">
          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">🐏 Koç (Baba)</label>
          <select id="sel-ind-sire" class="c-modal-input" style="width:100%; border-radius:8px; padding:10px; margin-bottom:12px;">${sireOptions}</select>

          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">🐑 Koyun (Ana)</label>
          <select id="sel-ind-dam" class="c-modal-input" style="width:100%; border-radius:8px; padding:10px; margin-bottom:8px;">${damOptions}</select>

          ${inbreedingAlert}
          ${compatHtml}

          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px; margin-top:8px;">📅 Eşleşme Tarihi</label>
          <input type="date" id="inp-ind-date" class="c-modal-input" value="${date}" style="width:100%; border-radius:8px; padding:10px;" />
        </div>
      `;
    }

    function _renderGroupTab(males, females, selectedSires, selectedDams, date, endDate) {
      // Koç seçimi (checkbox listesi)
      const sireCheckboxes = males.map(m => `
        <label style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; background:rgba(255,255,255,0.03); margin-bottom:4px; cursor:pointer; font-size:0.85rem; color:var(--text-primary);">
          <input type="checkbox" class="grp-sire-cb" value="${m.id}" ${selectedSires.has(m.id) ? 'checked' : ''} style="accent-color:#a855f7;" />
          🐏 ${m.id} — ${m.breed || ''} ${m.type || ''}
        </label>
      `).join('');

      // Dişi seçimi (checkbox listesi — varsayılan tüm boş dişiler seçili)
      const damCheckboxes = females.map(f => `
        <label style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; background:rgba(255,255,255,0.03); margin-bottom:4px; cursor:pointer; font-size:0.85rem; color:var(--text-primary);">
          <input type="checkbox" class="grp-dam-cb" value="${f.id}" ${selectedDams.has(f.id) ? 'checked' : ''} style="accent-color:#a855f7;" />
          🐑 ${f.id} — ${f.breed || ''} ${f.type || ''}
        </label>
      `).join('');

      return `
        <div style="text-align:left;">
          <!-- Koç(lar) Seçimi -->
          <div style="font-size:0.8rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">🐏 Koç(lar) Seçin</div>
          <div style="max-height:120px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:6px; margin-bottom:12px;">
            ${sireCheckboxes || '<p style="font-size:0.8rem; color:var(--text-muted); text-align:center;">Sürüde erkek hayvan yok.</p>'}
          </div>

          <!-- Koyun Seçimi -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
            <span style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">🐑 Koyunlar (Boş Anaçlar)</span>
            <div style="display:flex; gap:6px;">
              <button id="btn-grp-select-all" style="font-size:0.65rem; padding:3px 8px; border-radius:6px; background:rgba(168,85,247,0.15); color:var(--accent-purple); border:1px solid rgba(168,85,247,0.3); cursor:pointer;">Tümünü Seç</button>
              <button id="btn-grp-deselect-all" style="font-size:0.65rem; padding:3px 8px; border-radius:6px; background:rgba(239,68,68,0.1); color:var(--danger-red); border:1px solid rgba(239,68,68,0.3); cursor:pointer;">Tümünü Kaldır</button>
            </div>
          </div>
          <div style="max-height:180px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:6px; margin-bottom:12px;">
            ${damCheckboxes || '<p style="font-size:0.8rem; color:var(--text-muted); text-align:center;">Boş dişi hayvan yok.</p>'}
          </div>
          <div style="text-align:right; font-size:0.7rem; color:var(--accent-purple); font-weight:600; margin-bottom:8px;">
            Seçili: ${selectedDams.size} / ${females.length} dişi
          </div>

          <!-- Tarihler -->
          <div style="display:flex; gap:8px;">
            <div style="flex:1;">
              <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">📅 Başlangıç</label>
              <input type="date" id="inp-grp-start" class="c-modal-input" value="${date}" style="width:100%; border-radius:8px; padding:10px;" />
            </div>
            <div style="flex:1;">
              <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">📅 Bitiş (Opsiyonel)</label>
              <input type="date" id="inp-grp-end" class="c-modal-input" value="${endDate}" style="width:100%; border-radius:8px; padding:10px;" />
            </div>
          </div>
        </div>
      `;
    }

    function _attachEvents() {
      const overlay = modalContainer.querySelector('#breeding-modal-overlay');
      const btnCancel = modalContainer.querySelector('#btn-breeding-cancel');
      const btnSave = modalContainer.querySelector('#btn-breeding-save');

      // Sekme değiştirme
      modalContainer.querySelectorAll('.breeding-modal-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          activeTab = btn.getAttribute('data-tab');
          _renderModal();
        });
      });

      // Bireysel — koç/koyun değiştiğinde inbreeding kontrolü
      const selSire = modalContainer.querySelector('#sel-ind-sire');
      const selDam = modalContainer.querySelector('#sel-ind-dam');
      if (selSire) {
        selSire.addEventListener('change', (e) => { selectedSireId = e.target.value; _renderModal(); });
      }
      if (selDam) {
        selDam.addEventListener('change', (e) => { selectedDamId = e.target.value; _renderModal(); });
      }

      // Bireysel tarih
      const inpDate = modalContainer.querySelector('#inp-ind-date');
      if (inpDate) inpDate.addEventListener('change', (e) => { matingDate = e.target.value; });

      // Grup — koç checkbox'ları
      modalContainer.querySelectorAll('.grp-sire-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selectedGroupSires.add(cb.value);
          else selectedGroupSires.delete(cb.value);
        });
      });

      // Grup — koyun checkbox'ları
      modalContainer.querySelectorAll('.grp-dam-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) selectedGroupDams.add(cb.value);
          else selectedGroupDams.delete(cb.value);
          // Seçili sayısını güncelle (basit re-render yerine DOM güncelleme)
          const countEl = modalContainer.querySelector('.grp-count-display');
          // re-render for count update
          _renderModal();
        });
      });

      // Grup — Tümünü Seç / Kaldır
      const btnSelectAll = modalContainer.querySelector('#btn-grp-select-all');
      const btnDeselectAll = modalContainer.querySelector('#btn-grp-deselect-all');
      if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
          selectedGroupDams = new Set(availableFemales.map(a => a.id));
          _renderModal();
        });
      }
      if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
          selectedGroupDams.clear();
          _renderModal();
        });
      }

      // Grup tarihler
      const inpGrpStart = modalContainer.querySelector('#inp-grp-start');
      const inpGrpEnd = modalContainer.querySelector('#inp-grp-end');
      if (inpGrpStart) inpGrpStart.addEventListener('change', (e) => { matingDate = e.target.value; });
      if (inpGrpEnd) inpGrpEnd.addEventListener('change', (e) => { groupEndDate = e.target.value; });

      // İptal
      btnCancel.addEventListener('click', () => {
        _closeModal();
        resolve({ saved: false });
      });

      // Kaydet
      btnSave.addEventListener('click', () => {
        if (activeTab === 'individual') {
          if (!selectedSireId || !selectedDamId) return;

          const record = createMatingRecord('INDIVIDUAL', {
            sireIds: [selectedSireId],
            damIds: [selectedDamId],
            startDate: matingDate
          }, animals);

          // State'e kaydet
          const currentRecords = [...(getState().breedingRecords || [])];
          currentRecords.unshift(record);
          setState({ breedingRecords: currentRecords });

          // Görevleri oluştur
          const tasks = syncBreedingTasks(record);
          tasks.forEach(t => addTask(t));

          _closeModal();
          resolve({ saved: true, record });

        } else {
          // GROUP
          if (selectedGroupSires.size === 0 || selectedGroupDams.size === 0) return;

          const record = createMatingRecord('GROUP', {
            sireIds: [...selectedGroupSires],
            damIds: [...selectedGroupDams],
            startDate: matingDate,
            endDate: groupEndDate || null
          }, animals);

          const currentRecords = [...(getState().breedingRecords || [])];
          currentRecords.unshift(record);
          setState({ breedingRecords: currentRecords });

          const tasks = syncBreedingTasks(record);
          tasks.forEach(t => addTask(t));

          _closeModal();
          resolve({ saved: true, record });
        }
      });
    }

    function _closeModal() {
      const overlay = modalContainer.querySelector('#breeding-modal-overlay');
      if (overlay) overlay.classList.remove('active');
      setTimeout(() => { modalContainer.innerHTML = ''; }, 200);
    }

    // İlk render
    _renderModal();
  });
}
