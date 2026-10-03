/**
 * ShepherdAI — Sürü Listesi Modülü
 * Tüm hayvanların listelendiği, arama ve filtreleme yapılabilen ana tablo/grid ekranı.
 */

import { getState, setState } from '../core/state.js';
import { showAlert, showFormModal } from '../core/modal.js';
import { addAnimal, isWeightPlausible, getWeightRange } from '../core/herdManager.js';
import { BREED_OPTIONS, ANIMAL_TYPES, ANIMAL_GROUPS, ANIMAL_LIMITS } from '../data/herd-constants.js';
import { getAllQuarantinedAnimals } from '../core/healthManager.js';

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

// Karantina durumu her çizimde bir kez hesaplanır (kart başına yeniden taranmaz)
let _quarantineMap = new Map();

function _renderContent() {
  const animals = getState().animals || [];
  _quarantineMap = new Map(getAllQuarantinedAnimals().map(q => [q.animalId, q]));
  const totalAnimalsInHerd = animals.length;
  
  // 1) Filtreleme
  let filtered = animals.filter(a => {
    // Search
    if (_searchTerm) {
      const term = _searchTerm.toLowerCase();
      const matchId = a.id && a.id.toLowerCase().includes(term);
      const matchRfid = a.rfid && a.rfid.toLowerCase().includes(term);
      const matchNickname = a.nickname && a.nickname.toLowerCase().includes(term);
      if (!matchId && !matchRfid && !matchNickname) {
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
      if (_activeFilter === 'Karantinadaki' && !_quarantineMap.has(a.id)) return false;
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
        <input type="text" id="search-animal" value="${_searchTerm}" placeholder="Küpe No, Lakap veya RFID Ara..." 
               style="width:100%; box-sizing:border-box; padding:12px 12px 12px 36px; border-radius:12px; background:var(--glass-bg); border:1px solid var(--glass-border); color:var(--text-primary); font-family:inherit;">
      </div>

      <!-- Filtre Chipleri -->
      <div class="filter-scroll" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; scrollbar-width:none;">
        ${['Tümü', 'Sağlıklı', 'Riskli', 'Gebe', 'Sağmal', 'Besi', 'Kuzu/Oğlak', 'Karantinadaki'].map(f => `
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

    <!-- Hayvan Listesi veya Boş Durum Placeholder'ı -->
    <div class="herd-list-grid" style="padding-bottom:var(--space-md); display:grid; gap:12px;">
      ${totalAnimalsInHerd === 0 ? `
        <div class="glass-card empty-herd-placeholder" style="text-align:center; padding:48px 20px; border-radius:24px; border:1px dashed rgba(255,255,255,0.18); background:rgba(255,255,255,0.02); margin:12px 0;">
          <div style="font-size:3.5rem; margin-bottom:14px; animation:bounce 2s infinite ease-in-out;">🐑</div>
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-primary); margin-bottom:8px;">
            Henüz kayıtlı hayvan bulunmuyor. İlk hayvanınızı ekleyin
          </h3>
          <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:24px; max-width:320px; margin-left:auto; margin-right:auto; line-height:1.5;">
            Sürünüzü yönetmeye başlamak ve yapay zeka analizlerini aktive etmek için ilk kaydınızı oluşturun.
          </p>
          <button id="btn-empty-add-animal" class="btn-primary" style="padding:14px 28px; border-radius:18px; font-weight:700; font-size:1rem; box-shadow:0 4px 20px rgba(34,197,94,0.35); cursor:pointer;">
            ➕ İlk Hayvanınızı Ekleyin
          </button>
        </div>
      ` : displayed.length === 0 ? `
        <div style="text-align:center; color:var(--text-muted); padding:40px 0;">Arama kriterlerine uygun hayvan bulunamadı.</div>
      ` : displayed.map(a => _renderAnimalCard(a)).join('')}
    </div>

    ${totalFiltered > _loadedCount ? `
      <div style="text-align:center; padding:0 var(--space-md) var(--space-xl);">
        <button id="btn-load-more" class="btn-secondary" style="padding:10px 24px; border-radius:30px; border:1px solid var(--glass-border);">Daha Fazla Yükle</button>
      </div>
    ` : '<div style="height:30px;"></div>'}

    <!-- Yeni Hayvan Butonu (Sadece hayvan varsa veya alt buton olarak) -->
    ${totalAnimalsInHerd > 0 ? `
      <div class="bottom-action-container" style="position:relative !important; margin-top:var(--space-md); margin-bottom:calc(var(--nav-height) + var(--space-xl)); width:calc(100% - var(--space-lg)*2);">
        <button class="huge-btn btn-primary" id="btn-add-animal" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; box-shadow:0 4px 16px rgba(59,130,246,0.3);">
          <span class="btn-icon">➕</span> Yeni Hayvan Ekle
        </button>
      </div>
    ` : ''}
  `;
  
  _attachEvents();
}

function _renderAnimalCard(animal) {
  let statusColor = 'var(--text-secondary)';
  let statusIcon = '✅';
  
  if (animal.status === 'warning') { statusColor = 'var(--accent-orange)'; statusIcon = '⚠️'; }
  if (animal.status === 'danger') { statusColor = 'var(--accent-red)'; statusIcon = '🛑'; }
  if (animal.status === 'good') { statusColor = 'var(--accent-green)'; }

  // Karantina kontrolu
  const ws = _quarantineMap.get(animal.id);
  const quarantineBadge = ws
    ? `<span style="font-size:0.6rem; background:rgba(239,68,68,0.15); color:var(--danger-red); padding:1px 6px; border-radius:6px; font-weight:600; margin-left:6px;">⚕️ ${ws.meatDaysLeft > 0 ? ws.meatDaysLeft + 'g' : ''}</span>`
    : '';

  const nicknameBadge = animal.nickname
    ? `<span style="font-size:0.85rem; color:var(--accent-blue); font-weight:600; margin-left:6px;">("${animal.nickname}")</span>`
    : '';

  return `
    <div class="glass-card animal-list-card" data-id="${animal.id}" style="padding:12px; display:flex; align-items:center; gap:12px; cursor:pointer;">
      <div class="a-avatar" style="width:48px; height:48px; border-radius:30%; background:var(--bg-primary); display:flex; align-items:center; justify-content:center; font-size:1.5rem; border:2px solid ${statusColor};">
        ${animal.type === 'Keçi' || animal.type === 'Oğlak' || animal.type === 'Teke' ? '🐐' : '🐑'}
      </div>
      <div class="a-info" style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:1rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${animal.id}${nicknameBadge}${quarantineBadge}</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${animal.breed} ${animal.type ? `(${animal.type})` : ''} &bull; ${animal.group}</div>
      </div>
      <div class="a-metrics" style="text-align:right; flex-shrink:0;">
        <div style="font-size:0.9rem; font-weight:700; white-space:nowrap;">${animal.weight > 0 ? animal.weight + ' kg' : '-'}${isWeightPlausible(animal) ? '' : ` <span title="${animal.type || 'Bu tür'} için beklenen aralık ${getWeightRange(animal.type).join('–')} kg. Hayvan profilinden tartım kaydını düzeltin." style="color:var(--warning-orange);">⚠️</span>`}</div>
        <div style="font-size:0.75rem; color:${statusColor}; white-space:nowrap;">${statusIcon} Skor: ${animal.yieldScore || '-'}</div>
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

  // Hayvan Ekleme Akışı Fonksiyonu
  const openAddAnimalModal = async () => {
    const state = getState();
    const femaleOpts = ['Bilinmiyor', ...(state.animals || []).filter(a => a.gender === 'Dişi').map(a => a.id)];
    const maleOpts = ['Bilinmiyor', ...(state.animals || []).filter(a => a.gender === 'Erkek').map(a => a.id)];

    // Hatalı girişte form, girilen değerlerle yeniden açılır (alanları baştan doldurmak gerekmez)
    let draft = {};
    let added = null;
    while (!added?.success) {
      const result = await showFormModal('Yeni Hayvan Kaydı', [
      { id: 'id', value: draft.id, label: 'Küpe No (RFID ile tarayabilirsiniz)', type: 'text', placeholder: 'Örn: TR-500' },
      { id: 'nickname', value: draft.nickname, label: 'Hayvan Lakabı / İsim (Opsiyonel)', type: 'text', placeholder: 'Örn: Pamuk, Kral, Karabaş' },
      { id: 'type', value: draft.type, label: 'Hayvan Türü / Kategorisi', type: 'select', options: ANIMAL_TYPES },
      { id: 'breed', value: draft.breed, label: 'Irk', type: 'select', options: BREED_OPTIONS },
      { id: 'gender', value: draft.gender, label: 'Cinsiyet', type: 'select', options: ['Dişi', 'Erkek'] },
      { id: 'group', value: draft.group, label: 'Grup', type: 'select', options: ANIMAL_GROUPS },
      { id: 'weight', value: draft.weight, label: `Güncel Ağırlık (kg, ${ANIMAL_LIMITS.defaultWeightKg[0]}–${ANIMAL_LIMITS.defaultWeightKg[1]})`, type: 'number', placeholder: 'Örn: 45', min: ANIMAL_LIMITS.defaultWeightKg[0], max: ANIMAL_LIMITS.defaultWeightKg[1], step: 0.1 },
      { id: 'ageMonths', value: draft.ageMonths, label: `Yaş (ay, 0–${ANIMAL_LIMITS.maxAgeMonths})`, type: 'number', placeholder: 'Örn: 18', min: 0, max: ANIMAL_LIMITS.maxAgeMonths, step: 1 },
      { id: 'purchasePrice', value: draft.purchasePrice, label: 'Alış Fiyatı (₺, opsiyonel — kârlılık hesabı için)', type: 'number', placeholder: 'Sürüde doğduysa boş bırakın' },
      { id: 'mother', value: draft.mother, label: 'Ana Küpe No', type: 'select', options: femaleOpts },
      { id: 'father', value: draft.father, label: 'Baba Küpe No', type: 'select', options: maleOpts }
    ], '🐑');
      if (!result || !result.id || result.id.trim() === '') return;

      added = addAnimal(result);
      if (!added.success) {
        await showAlert('Kayıt Yapılamadı', added.message, '⚠️');
        draft = result;
      }
    }

    const newAnimal = added.animal;
    const displayName = newAnimal.nickname ? `${newAnimal.id} ("${newAnimal.nickname}")` : newAnimal.id;
    await showAlert('Başarılı', `${displayName} (${newAnimal.type}) başarıyla sürüye eklendi.`, '✅');
    _renderContent();
  };

  const addBtn = _container.querySelector('#btn-add-animal');
  if (addBtn) addBtn.addEventListener('click', openAddAnimalModal);

  const emptyAddBtn = _container.querySelector('#btn-empty-add-animal');
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', openAddAnimalModal);
}
