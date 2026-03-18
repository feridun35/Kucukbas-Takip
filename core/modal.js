/**
 * ShepherdAI — Custom UI Modal Controller
 * Tarayıcı varsayılan pencerelerini (alert, confirm, prompt)
 * Şık, cam efektli (glassmorphism) özel UI bileşenleriyle değiştirir.
 */

// Modal kapsayıcısını DOM'da garantile
function _ensureModalContainer() {
  let container = document.getElementById('custom-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'custom-modal-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Bilgilendirme amaçlı Alert Modalı.
 * @param {string} title 
 * @param {string} message 
 * @param {string} icon 
 * @returns {Promise} 'Tamam' butonuna basıldığında çözülür
 */
export function showAlert(title, message, icon = 'ℹ️') {
  return new Promise((resolve) => {
    const container = _ensureModalContainer();
    
    // UI oluştur
    const modalHTML = `
      <div class="c-modal-overlay active">
        <div class="c-modal-box">
          <div class="c-modal-icon">${icon}</div>
          <h3 class="c-modal-title">${title}</h3>
          <p class="c-modal-message">${message}</p>
          <div class="c-modal-actions">
            <button class="btn-primary" id="btn-modal-ok">Tamam</button>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = modalHTML;
    
    // Event listeners
    const overlay = container.querySelector('.c-modal-overlay');
    const btnOk = container.querySelector('#btn-modal-ok');
    
    const closeAndResolve = () => {
      overlay.classList.remove('active');
      setTimeout(() => { container.innerHTML = ''; resolve(true); }, 200);
    };

    btnOk.addEventListener('click', closeAndResolve);
  });
}

/**
 * Onay (Confirm) Modalı.
 * @param {string} title 
 * @param {string} message 
 * @param {string} icon 
 * @returns {Promise<boolean>} Evet: true, Hayır: false
 */
export function showConfirm(title, message, icon = '❓') {
  return new Promise((resolve) => {
    const container = _ensureModalContainer();
    
    const modalHTML = `
      <div class="c-modal-overlay active">
        <div class="c-modal-box">
          <div class="c-modal-icon">${icon}</div>
          <h3 class="c-modal-title">${title}</h3>
          <p class="c-modal-message">${message}</p>
          <div class="c-modal-actions" style="display:flex; gap:12px;">
            <button class="btn-secondary" id="btn-modal-cancel" style="flex:1;">İptal</button>
            <button class="btn-primary" id="btn-modal-yes" style="flex:1;">Onayla</button>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = modalHTML;
    
    const overlay = container.querySelector('.c-modal-overlay');
    const btnYes = container.querySelector('#btn-modal-yes');
    const btnCancel = container.querySelector('#btn-modal-cancel');
    
    const closeAndResolve = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => { container.innerHTML = ''; resolve(result); }, 200);
    };

    btnYes.addEventListener('click', () => closeAndResolve(true));
    btnCancel.addEventListener('click', () => closeAndResolve(false));
  });
}

/**
 * Kullanıcı Girişi (Prompt) Modalı.
 * @param {string} title 
 * @param {string} message 
 * @param {string} inputType 'text' veya 'number'
 * @param {string} icon 
 * @returns {Promise<string|null>} Metin yoksa veya iptalse null
 */
export function showPrompt(title, message, inputType = 'text', icon = '✏️') {
  return new Promise((resolve) => {
    const container = _ensureModalContainer();
    
    const modalHTML = `
      <div class="c-modal-overlay active">
        <div class="c-modal-box">
          <div class="c-modal-icon">${icon}</div>
          <h3 class="c-modal-title">${title}</h3>
          <p class="c-modal-message">${message}</p>
          <input type="${inputType}" class="c-modal-input" id="c-modal-input-field" placeholder="Değer giriniz..."/>
          <div class="c-modal-actions" style="display:flex; gap:12px;">
            <button class="btn-secondary" id="btn-modal-cancel" style="flex:1;">İptal</button>
            <button class="btn-primary" id="btn-modal-save" style="flex:1;">Kaydet</button>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = modalHTML;
    
    const overlay = container.querySelector('.c-modal-overlay');
    const btnSave = container.querySelector('#btn-modal-save');
    const btnCancel = container.querySelector('#btn-modal-cancel');
    const inputField = container.querySelector('#c-modal-input-field');
    
    // Otomatik odaklan
    setTimeout(() => inputField.focus(), 100);
    
    const closeAndResolve = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => { container.innerHTML = ''; resolve(result); }, 200);
    };

    btnSave.addEventListener('click', () => {
      const val = inputField.value.trim();
      closeAndResolve(val === '' ? null : val);
    });
    
    btnCancel.addEventListener('click', () => closeAndResolve(null));
  });
}

/**
 * Özelleştirilmiş Form Modalı.
 * @param {string} title 
 * @param {Array} fields - [{id, label, type, placeholder, options}]
 * @param {string} icon 
 * @returns {Promise<Object|null>}
 */
export function showFormModal(title, fields, icon = '📝') {
  return new Promise((resolve) => {
    const container = _ensureModalContainer();
    
    const fieldsHTML = fields.map(f => {
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
        return `
          <div style="margin-bottom:12px; text-align:left;">
            <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">${f.label}</label>
            <select id="form_${f.id}" class="c-modal-input" style="width:100%; border-radius:8px; padding:10px;">${opts}</select>
          </div>
        `;
      }
      return `
        <div style="margin-bottom:12px; text-align:left;">
          <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">${f.label}</label>
          <input type="${f.type}" id="form_${f.id}" class="c-modal-input" placeholder="${f.placeholder || ''}" style="width:100%; border-radius:8px; padding:10px;"/>
        </div>
      `;
    }).join('');

    const modalHTML = `
      <div class="c-modal-overlay active">
        <div class="c-modal-box" style="max-height:90vh; overflow-y:auto;">
          <div class="c-modal-icon">${icon}</div>
          <h3 class="c-modal-title" style="margin-bottom:16px;">${title}</h3>
          
          <div style="margin-bottom:20px;">
            <button class="btn-secondary" id="btn-scan-rfid" style="width:100%; margin-bottom:16px; font-size:0.85rem; padding:8px; border:1px dashed var(--accent-blue); color:var(--accent-blue); border-radius:8px;">
              📡 RFID Tara (Simülasyon)
            </button>
            ${fieldsHTML}
          </div>

          <div class="c-modal-actions" style="display:flex; gap:12px;">
            <button class="btn-secondary" id="btn-modal-cancel" style="flex:1;">İptal</button>
            <button class="btn-primary" id="btn-modal-save" style="flex:1;">Kaydet</button>
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = modalHTML;
    
    const overlay = container.querySelector('.c-modal-overlay');
    const btnSave = container.querySelector('#btn-modal-save');
    const btnCancel = container.querySelector('#btn-modal-cancel');
    const btnScan = container.querySelector('#btn-scan-rfid');
    
    // RFID Scan Simulation
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        const idField = container.querySelector('#form_id');
        if (idField) {
          idField.value = 'TR-' + Math.floor(Math.random() * 900 + 100);
          btnScan.innerHTML = '✅ Tarandı';
          btnScan.style.color = 'var(--accent-green)';
          btnScan.style.borderColor = 'var(--accent-green)';
        }
      });
    }

    const closeAndResolve = (result) => {
      overlay.classList.remove('active');
      setTimeout(() => { container.innerHTML = ''; resolve(result); }, 200);
    };

    btnSave.addEventListener('click', () => {
      const resultObj = {};
      fields.forEach(f => {
        const el = container.querySelector('#form_' + f.id);
        if (el) resultObj[f.id] = el.value;
      });
      closeAndResolve(resultObj);
    });
    
    btnCancel.addEventListener('click', () => closeAndResolve(null));
  });
}
