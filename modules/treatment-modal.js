/**
 * ShepherdAI — Akıllı Tedavi Uygulama Modalı
 * 
 * İnce UI katmanı — tüm iş mantığı core/healthManager.js'den çağrılır.
 * Bu modül sadece modal form akışını yönetir:
 *   1. İlaç seçimi
 *   2. Hayvan seçimi (tek / toplu)
 *   3. Gebelik bariyeri
 *   4. Doz onayı
 *   5. Uygulama kaydı
 */

import { showSelect, showAlert, showConfirm, showFormModal } from '../core/modal.js';
import { getState } from '../core/state.js';
import {
  getAllMedications,
  calculateDosage,
  calculateBatchDosage,
  checkPregnancyRisk,
  getAvailableStock,
  applyTreatment
} from '../core/healthManager.js';
import { MED_CATEGORIES } from '../data/med-library.js';

/**
 * Ana tedavi uygulama akışını başlatır.
 * Hayvan profili veya health-meds sayfasından çağrılır.
 * 
 * @param {string|null} preselectedAnimalId - Hayvan profilinden geliniyorsa
 * @returns {Promise<{applied: boolean}>}
 */
export async function openTreatmentModal(preselectedAnimalId = null) {
  const state = getState();
  const animals = state.animals || [];
  const meds = getAllMedications();

  if (meds.length === 0) {
    await showAlert('Uyarı', 'İlaç kütüphanesi boş. Lütfen önce ilaç tanımlayın.', '⚠️');
    return { applied: false };
  }

  // ── 1. İLAÇ SEÇİMİ ──
  const medOptions = meds.map(m => {
    const cat = MED_CATEGORIES.find(c => c.value === m.category);
    const stock = getAvailableStock(m.id);
    const stockLabel = stock.total > 0 ? `(Stok: ${stock.total} ${stock.unit})` : '(Stok YOK)';
    return {
      value: m.id,
      label: `${m.name} — ${cat?.label || m.category} ${stockLabel}`,
      color: stock.total > 0 ? '#22c55e' : '#ef4444',
      icon: '💊'
    };
  });

  const medSel = await showSelect('İlaç Seçin', medOptions, '💊');
  if (!medSel) return { applied: false };
  const selectedMed = meds.find(m => m.id === medSel.value);
  if (!selectedMed) return { applied: false };

  // Stok kontrolü
  const stockInfo = getAvailableStock(selectedMed.id);
  if (stockInfo.total <= 0) {
    await showAlert('Stok Yetersiz', `${selectedMed.name} için kullanılabilir stok bulunmuyor. Lütfen ecza deposuna stok ekleyin.`, '⛔');
    return { applied: false };
  }

  // ── 2. UYGULAMA TİPİ & HAYVAN SEÇİMİ ──
  let applicationType = 'single';
  let selectedAnimals = [];

  if (preselectedAnimalId) {
    // Hayvan profili'nden gelinmiş — direkt tek hayvan
    const animal = animals.find(a => a.id === preselectedAnimalId);
    if (animal) {
      selectedAnimals = [animal];
      applicationType = 'single';
    }
  } else {
    // Genel ekran — seçim yaptır
    const typeOpts = [
      { value: 'single', label: 'Tek Hayvan Seçimi', color: '#3b82f6', icon: '🐑' },
      { value: 'batch-gebe', label: 'Tüm Gebe Hayvanlar', color: '#a855f7', icon: '🤰' },
      { value: 'batch-besi', label: 'Tüm Besi Tokluları', color: '#f97316', icon: '🥩' },
      { value: 'batch-koc', label: 'Tüm Koçlar / Tekeler', color: '#06b6d4', icon: '🐏' },
      { value: 'batch-sagmal', label: 'Tüm Sağmal Hayvanlar', color: '#22c55e', icon: '🥛' },
      { value: 'batch-all', label: 'Tüm Sürü', color: '#ef4444', icon: '🐑' }
    ];

    const typeSel = await showSelect('Uygulama Tipi', typeOpts, '📋');
    if (!typeSel) return { applied: false };

    if (typeSel.value === 'single') {
      applicationType = 'single';
      const animalOpts = animals.map(a => ({
        value: a.id,
        label: `${a.id} — ${a.breed} (${a.group}) ${a.weight ? a.weight + ' kg' : ''}`,
        color: a.status === 'danger' ? '#ef4444' : a.status === 'warning' ? '#f97316' : '#22c55e',
        icon: a.type === 'Keçi' || a.type === 'Oğlak' || a.type === 'Teke' ? '🐐' : '🐑'
      }));
      const animalSel = await showSelect('Hayvan Seçin', animalOpts, '🐑');
      if (!animalSel) return { applied: false };
      const animal = animals.find(a => a.id === animalSel.value);
      if (animal) selectedAnimals = [animal];
    } else {
      applicationType = 'batch';
      const filterMap = {
        'batch-gebe': a => a.group === 'Gebe',
        'batch-besi': a => a.group === 'Besi',
        'batch-koc': a => a.gender === 'Erkek' && (a.type === 'Koç' || a.type === 'Teke' || a.group === 'Damızlık'),
        'batch-sagmal': a => a.group === 'Sağmal',
        'batch-all': () => true
      };
      selectedAnimals = animals.filter(filterMap[typeSel.value] || (() => true));
    }
  }

  if (selectedAnimals.length === 0) {
    await showAlert('Uyarı', 'Seçilen kriterlere uyan hayvan bulunamadı.', '⚠️');
    return { applied: false };
  }

  // ── 3. GEBELİK BARİYERİ ──
  const pregCheck = checkPregnancyRisk(selectedMed.id, selectedAnimals);
  if (pregCheck.hasRisk) {
    const pregNames = pregCheck.pregnantAnimals.map(a => a.id).join(', ');
    const proceed = await showConfirm(
      '🚨 GEBELİK UYARISI — KONTRENDİKASYON',
      `DİKKAT: Aşağıdaki hayvan(lar) GEBEDİR:\n${pregNames}\n\n` +
      `${selectedMed.name} (${selectedMed.activeIngredient}):\n${pregCheck.warning}\n\n` +
      `Bu ilacı gebe hayvanlara uygulamak istediğinize emin misiniz?\nBu işlem kayıt altına alınacaktır.`,
      '🚨'
    );
    if (!proceed) return { applied: false };
  }

  // ── 4. DOZ HESAPLAMA & ONAY ──
  let recommendedDosage, dosageFormula, perHeadCalcStr = '';

  if (applicationType === 'single') {
    const calc = calculateDosage(selectedMed.id, parseFloat(selectedAnimals[0].weight) || 40);
    recommendedDosage = calc.dosage;
    dosageFormula = calc.formula;
  } else {
    const calc = calculateBatchDosage(selectedMed.id, selectedAnimals);
    recommendedDosage = calc.totalDosage;
    dosageFormula = calc.formula;
    perHeadCalcStr = ` (Hayvan başı net: ${calc.perHeadDosage} ${selectedMed.unit})`;
  }

  // Stok yeterliliği
  if (recommendedDosage > stockInfo.total) {
    const cont = await showConfirm(
      '⚠️ Stok Uyarısı',
      `Önerilen dozaj (${recommendedDosage} ${selectedMed.unit}) mevcut stoktan (${stockInfo.total} ${stockInfo.unit}) fazla.\n\nDozu revize ederek devam etmek ister misiniz?`,
      '⚠️'
    );
    if (!cont) return { applied: false };
    recommendedDosage = stockInfo.total;
  }

  const doseFormLabel = applicationType === 'single'
    ? `Önerilen Doz (${selectedMed.unit})`
    : `Toplam Sürü Dozajı (${selectedMed.unit})${perHeadCalcStr}`;

  const doseForm = await showFormModal(`Dozaj Onayı — ${selectedMed.name}`, [
    { id: 'dosage', label: doseFormLabel, type: 'number', value: recommendedDosage, placeholder: dosageFormula },
    { id: 'notes', label: 'Not / Açıklama', type: 'text', placeholder: 'Opsiyonel tedavi notu...' }
  ], '💉');

  if (!doseForm) return { applied: false };

  const finalDosage = parseFloat(doseForm.dosage) || recommendedDosage;

  // ── 5. UYGULAMA ──
  const animalIds = selectedAnimals.map(a => a.id);
  const result = applyTreatment({
    medId: selectedMed.id,
    animalIds,
    applicationType,
    dosage: finalDosage,
    pregnancyOverride: pregCheck.hasRisk,
    notes: doseForm.notes || ''
  });

  if (result.success) {
    let summaryMsg = `${selectedMed.name} başarıyla uygulandı.\n`;
    if (applicationType === 'single') {
      summaryMsg += `Uygulanan Doz: ${result.record.appliedDosePerAnimal} ${selectedMed.unit}\n`;
      summaryMsg += `Hedef: ${animalIds[0]}`;
    } else {
      summaryMsg += `Toplam Sürü Sarfiyatı: ${result.record.totalBatchQuantity} ${selectedMed.unit}\n`;
      summaryMsg += `Hayvan Başı Net Doz: ${result.record.appliedDosePerAnimal} ${selectedMed.unit}\n`;
      summaryMsg += `Hedef: ${animalIds.length} hayvan (toplu)`;
    }
    if (selectedMed.treatmentCourse?.days > 1) {
      summaryMsg += `\n\n⏱️ ${selectedMed.treatmentCourse.days} günlük kür başlatıldı. Sonraki doz görevleri Görev Panosuna eklendi.`;
    }
    if (selectedMed.meatWithdrawalDays > 0 || selectedMed.milkWithdrawalDays > 0) {
      summaryMsg += `\n\n🛑 Arınma süresi aktif edildi.`;
    }
    await showAlert('Tedavi Uygulandı ✅', summaryMsg, '✅');
    return { applied: true };
  } else {
    await showAlert('Hata', result.message, '❌');
    return { applied: false };
  }
}
