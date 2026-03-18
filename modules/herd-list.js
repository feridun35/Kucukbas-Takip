/**
 * ShepherdAI — Sürü Listesi Modülü
 * Tüm hayvanların listelendiği, arama ve filtreleme yapılabilen ana tablo/grid ekranı.
 */

import { getState, setState } from '../core/state.js';
import { showAlert, showFormModal } from '../core/modal.js';

let _container = null;
let _searchTerm = '';
let _activeFilter = 'Tümü';
let _loadedCount = 20; // Lazy load / Pagination için

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter herd-list-page';
  
  _renderContent();

  return _container;
}

export function init() {
  if (!_container) return;
  _attachEvents();
}

function _renderContent() {
  const animals = getState().animals || [];
  
  // 1) Filtreleme
  let filtered = animals.filter(a => {
    // Search
    if (_searchTerm) {
      const term = _searchTerm.toLowerCase();
      if (!a.id.toLowerCase().includes(term) && !a.rfid.toLowerCase().includes(term)) {
        return false;
      }
    }
    // Filter
    if (_activeFilter !== 'Tümü') {
      if (_activeFilter === 'Sağlıklı' && a.status !== 'good') return false;
      if (_activeFilter === 'Riskli' && a.status === 'good') return false;
      if (_activeFilter === 'Gebe' && a.group !== 'Gebe') return false;
      if (_activeFilter === 'Besi' && a.group !== 'Besi') return false;
      if (_activeFilter === 'Sağmal' && a.group !== 'Sağmal') return false;
      if (_activeFilter === 'Kuzu/Oğlak' && a.type !== 'Kuzu' && a.type !== 'Oğlak') return false;
    }
    return true;
  });

  const totalFiltered = filtered.length;
  // 2) Pagination / Sınırlama
  const displayed = filtered.slice(0, _loadedCount);

  _container.innerHTML = `
    <div class="herd-list-header" style="position:sticky; top:0; background:rgba(30, 41, 59, 0.85); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); padding:var(--space-md) var(--space-md) 12px; z-index:20; margin: calc(var(--space-md)*-1) calc(var(--space-md)*-1) 12px calc(var(--space-md)*-1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="font-size:1.2rem; font-weight:700;">Sürü Listesi <span style="font-size:0.8rem; color:var(--text-muted)">(${totalFiltered})</span></h2>
      </div>
      
      <!-- Arama -->
      <div class="search-box" style="margin-bottom:12px; position:relative;">
        <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); opacity:0.5;">🔍</span>
        <input type="text" id="search-animal" value="${_searchTerm}" placeholder="Küpe No veya RFID Ara..." 
               style="width:100%; padding:12px 12px 12px 36px; border-radius:12px; background:var(--glass-bg); border:1px solid var(--glass-border); color:var(--text-primary); font-family:inherit;">
      </div>

      <!-- Filtre Chipleri -->
      <div class="filter-scroll" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none;">
        ${['Tümü', 'Sağlıklı', 'Riskli', 'Gebe', 'Sağmal', 'Besi', 'Kuzu/Oğlak'].map(f => `
          <button class="filter-chip ${f === _activeFilter ? 'active' : ''}" data-filter="${f}" 
                  style="white-space:nowrap; padding:6px 16px; border-radius:20px; font-size:0.85rem; font-weight:600; 
                         background:${f === _activeFilter ? 'var(--accent-blue)' : 'var(--glass-bg)'}; 
                         border:1px solid ${f === _activeFilter ? 'transparent' : 'var(--glass-border)'}; 
                         color:${f === _activeFilter ? '#fff' : 'var(--text-secondary)'}; cursor:pointer; transition:0.2s;">
            ${f}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="herd-list-grid" style="padding-bottom:var(--space-md); display:grid; gap:12px;">
      ${displayed.map(a => _renderAnimalCard(a)).join('')}
      ${displayed.length === 0 ? '<div style="text-align:center; color:var(--text-muted); padding:40px 0;">Hayvan bulunamadı.</div>' : ''}
    </div>

    ${totalFiltered > _loadedCount ? `
      <div style="text-align:center; padding:0 var(--space-md) var(--space-xl);">
        <button id="btn-load-more" class="btn-secondary" style="padding:10px 24px; border-radius:30px; border:1px solid var(--glass-border);">Daha Fazla Yükle</button>
      </div>
    ` : '<div style="height:30px;"></div>'}

    <!-- Yeni Hayvan Butonu -->
    <div class="bottom-action-container" style="position:relative !important; margin-top:var(--space-md); margin-bottom:calc(var(--nav-height) + var(--space-xl)); width:calc(100% - var(--space-lg)*2);">
      <button class="huge-btn btn-primary" id="btn-add-animal" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; box-shadow:0 4px 16px rgba(59,130,246,0.3);">
        <span class="btn-icon">➕</span> Yeni Hayvan Ekle
      </button>
    </div>
  `;
  
  _attachEvents();
}

function _renderAnimalCard(animal) {
  let statusColor = 'var(--text-secondary)';
  let statusIcon = '✅';
  
  if (animal.status === 'warning') { statusColor = 'var(--accent-orange)'; statusIcon = '⚠️'; }
  if (animal.status === 'danger') { statusColor = 'var(--accent-red)'; statusIcon = '🛑'; }
  if (animal.status === 'good') { statusColor = 'var(--accent-green)'; }

  return `
    <div class="glass-card animal-list-card" data-id="${animal.id}" style="padding:12px; display:flex; align-items:center; gap:12px; cursor:pointer;">
      <div class="a-avatar" style="width:48px; height:48px; border-radius:30%; background:var(--bg-primary); display:flex; align-items:center; justify-content:center; font-size:1.5rem; border:2px solid ${statusColor};">
        ${animal.type === 'Keçi' || animal.type === 'Oğlak' || animal.type === 'Teke' ? '🐐' : '🐑'}
      </div>
      <div class="a-info" style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:1rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${animal.id}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${animal.breed} &bull; ${animal.group}</div>
      </div>
      <div class="a-metrics" style="text-align:right; flex-shrink:0;">
        <div style="font-size:0.9rem; font-weight:700; white-space:nowrap;">${animal.weight} kg</div>
        <div style="font-size:0.75rem; color:${statusColor}; white-space:nowrap;">${statusIcon} Skor: ${animal.yieldScore}</div>
      </div>
    </div>
  `;
}

function _attachEvents() {
  const searchInput = _container.querySelector('#search-animal');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _searchTerm = e.target.value;
      _loadedCount = 20; // reset
      _renderContent();
      // focus'u geri ver
      const newSearch = _container.querySelector('#search-animal');
      if (newSearch) {
        newSearch.focus();
        newSearch.setSelectionRange(_searchTerm.length, _searchTerm.length);
      }
    });
  }

  // Hayvan Kartlarına Tıklayınca Pasaporta Git
  _container.querySelectorAll('.animal-list-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const animalId = e.currentTarget.dataset.id;
      // Normalde URL parametresi veya state üzerinden ID aktarılır.
      // Şimdilik state'e activeAnimalId yazıp profile'a yönlendirelim:
      const state = getState();
      setState({ activeAnimalId: animalId });
      import('../core/router.js').then(module => {
        module.navigateTo('animal-profile');
      });
    });
  });

  _container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      _activeFilter = e.target.dataset.filter;
      _loadedCount = 20;
      _renderContent();
    });
  });

  const loadMoreBtn = _container.querySelector('#btn-load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      _loadedCount += 20;
      _renderContent();
    });
  }

  const addBtn = _container.querySelector('#btn-add-animal');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const result = await showFormModal('Yeni Hayvan', [
        { id: 'id', label: 'Küpe No (RFID ile tarayabilirsiniz)', type: 'text', placeholder: 'Örn: TR-500' },
        { id: 'breed', label: 'Irk', type: 'select', options: ['Merinos', 'Kıvırcık', 'İvesi', 'Saanen', 'Karakaya'] },
        { id: 'gender', label: 'Cinsiyet', type: 'select', options: ['Dişi', 'Erkek'] },
        { id: 'group', label: 'Grup', type: 'select', options: ['Besi', 'Sağmal', 'Gebe', 'Boş', 'Damızlık'] },
        { id: 'weight', label: 'Güncel Ağırlık (kg)', type: 'number', placeholder: 'Örn: 45' }
      ], '🐑');

      if (result && result.id) {
        const newAnimal = {
          id: result.id,
          rfid: 'RFID-' + Math.floor(Math.random() * 90000 + 10000),
          breed: result.breed,
          gender: result.gender,
          type: result.breed === 'Saanen' ? (result.gender==='Dişi'?'Keçi':'Teke') : (result.gender==='Dişi'?'Koyun':'Koç'),
          group: result.group,
          weight: parseFloat(result.weight) || 0,
          bcs: 3,
          status: 'good',
          yieldScore: 80,
          lastVaccine: '-'
        };

        const currentAnimals = getState().animals;
        currentAnimals.unshift(newAnimal); // Add to top
        setState({ animals: currentAnimals });

        await showAlert('Başarılı', `${newAnimal.id} başarıyla sürüye eklendi.`, '✅');
        
        // Yeniden renderla
        _renderContent();
      }
    });
  }
}
