/**
 * ShepherdAI — Yem Deposu Motoru (Feed Manager)
 * Yem girişi (ağırlıklı ortalama fiyat), stoktan düşüş, günlük sürü yemlemesi ve rasyon kullanımı.
 * UI (finance-silo.js) yalnızca form toplar ve bu fonksiyonları çağırır.
 */

import { todayIso } from './dateUtils.js';
import { stripTags } from './sanitize.js';
import { getState, setState } from './state.js';
import { FEED_CATALOG } from '../data/feed-catalog.js';

const _historyDate = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
const _round1 = (n) => parseFloat(n.toFixed(1));

export function getFeedCatalog() {
  return FEED_CATALOG;
}

/**
 * Depo özetini hesaplar (saf).
 * @param {Array} feedInventory
 * @returns {{ totalKg: number, totalValue: number }}
 */
export function getFeedInventorySummary(feedInventory = []) {
  const totalKg = feedInventory
    .filter(f => f.unit === 'kg')
    .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);
  const totalValue = feedInventory
    .reduce((sum, f) => sum + (parseFloat(f.amount) || 0) * (f.unitPrice || 0), 0);
  return { totalKg, totalValue };
}

/** Depodaki mevcut birim fiyat; yoksa katalog varsayılanı */
export function getCurrentFeedPrice(feedId) {
  const existing = (getState().feedInventory || []).find(f => f.id === feedId);
  const cat = FEED_CATALOG.find(c => c.id === feedId);
  return existing?.unitPrice || cat?.defaultPrice || 0;
}

/**
 * Depoya yem girişi yapar. Mevcut stok varsa birim fiyat ağırlıklı ortalama ile güncellenir.
 * @param {{ feedId, amount, unitPrice?, note? }} input
 */
export function addFeedStock({ feedId, amount, unitPrice, note }) {
  const cat = FEED_CATALOG.find(c => c.id === feedId);
  if (!cat) return { success: false, message: 'Yem türü bulunamadı.' };

  const qty = parseFloat(amount);
  if (isNaN(qty) || qty <= 0) return { success: false, message: 'Geçerli bir miktar giriniz.' };

  const state = getState();
  const feedInventory = [...(state.feedInventory || [])];
  const idx = feedInventory.findIndex(f => f.id === feedId);
  const price = parseFloat(unitPrice) || (idx > -1 ? feedInventory[idx].unitPrice : 0) || cat.defaultPrice;

  if (idx > -1) {
    const oldAmt = parseFloat(feedInventory[idx].amount) || 0;
    const oldPrice = feedInventory[idx].unitPrice || price;
    const newWeightedPrice = ((oldAmt * oldPrice) + (qty * price)) / (oldAmt + qty);
    feedInventory[idx] = {
      ...feedInventory[idx],
      amount: oldAmt + qty,
      unitPrice: parseFloat(newWeightedPrice.toFixed(2))
    };
  } else {
    feedInventory.push({ id: cat.id, name: cat.name, icon: cat.icon, amount: qty, unit: cat.unit, unitPrice: price });
  }

  const totalPrice = qty * price;
  const feedHistory = [{
    id: 'FH-' + Date.now(),
    feedId: cat.id,
    feedName: cat.name,
    amount: qty,
    unitPrice: price,
    totalPrice,
    type: 'entry',
    date: _historyDate(),
    note: note ? `${stripTags(note)} (${price} ₺/${cat.unit})` : `${price} ₺/${cat.unit}`
  }, ...(state.feedHistory || [])];

  setState({ feedInventory, feedHistory });
  return {
    success: true,
    message: `${cat.name} stokuna ${qty} ${cat.unit} eklendi.\nBirim Fiyat: ${price} ₺ | Toplam Tutar: ${totalPrice.toLocaleString('tr-TR')} ₺`,
    totalPrice
  };
}

const DAILY_FEED_NOTE = 'Günlük Sürü Yemlemesi Düşüşü';

/** Bugün günlük sürü yemlemesi zaten düşüldü mü? */
export function isDailyFeedDeductedToday() {
  const today = todayIso();
  return (getState().feedHistory || []).some(h => h.isoDate === today && h.note === DAILY_FEED_NOTE);
}

/**
 * Sürünün günlük hesaplanan yem tüketimini kg cinsinden yemlerden orantılı düşer.
 * Aynı gün ikinci kez çağrılırsa `{ force: true }` verilmedikçe düşüş yapılmaz (çift düşüşü önler).
 */
export function deductDailyHerdFeed({ force = false } = {}) {
  if (!force && isDailyFeedDeductedToday()) {
    return { success: false, reason: 'already-today', message: 'Bugünün sürü yemlemesi zaten stoktan düşüldü.' };
  }
  const state = getState();
  const dailyConsumption = state.financeSummary?.dailyFeedKg || 0;
  if (dailyConsumption <= 0) {
    return { success: false, message: 'Sürüde aktif hayvan olmadığı için günlük tüketim 0 kg olarak hesaplanmıştır.', reason: 'empty-herd' };
  }

  const feedInventory = [...(state.feedInventory || [])];
  const kgFeeds = feedInventory.filter(f => f.unit === 'kg' && f.amount > 0);
  if (kgFeeds.length === 0) {
    return { success: false, message: 'Depoda kilogram cinsinden kullanılabilecek yem bulunmuyor.', reason: 'no-stock' };
  }

  const totalAvailableKg = kgFeeds.reduce((s, f) => s + f.amount, 0);
  const deductAmount = Math.min(dailyConsumption, totalAvailableKg);
  const feedHistory = [...(state.feedHistory || [])];
  const date = _historyDate();

  kgFeeds.forEach(f => {
    const idx = feedInventory.findIndex(item => item.id === f.id);
    if (idx === -1) return;
    const actualDeduct = _round1((f.amount / totalAvailableKg) * deductAmount);
    feedInventory[idx] = { ...feedInventory[idx], amount: Math.max(0, _round1(feedInventory[idx].amount - actualDeduct)) };
    feedHistory.unshift({
      id: 'FH-' + Date.now() + '-' + f.id,
      feedId: f.id,
      feedName: f.name,
      amount: actualDeduct,
      unitPrice: f.unitPrice || 0,
      totalPrice: actualDeduct * (f.unitPrice || 0),
      type: 'deduction',
      date,
      isoDate: todayIso(),
      note: DAILY_FEED_NOTE
    });
  });

  setState({ feedInventory, feedHistory });
  return { success: true, message: `Sürünün günlük ${deductAmount} kg yem tüketimi depodaki yem stoklarından düşüldü ve geçmişe kaydedildi.`, deductAmount };
}

/**
 * Tek bir yemden manuel çıkış yapar.
 * @param {{ feedId, amount, reason?, note? }} input
 */
export function deductFeed({ feedId, amount, reason, note }) {
  const state = getState();
  const feedInventory = [...(state.feedInventory || [])];
  const idx = feedInventory.findIndex(f => f.id === feedId);
  if (idx === -1) return { success: false, message: 'Yem stoğu bulunamadı.' };

  const qty = parseFloat(amount);
  if (isNaN(qty) || qty <= 0) return { success: false, message: 'Geçerli bir miktar giriniz.' };

  const target = feedInventory[idx];
  const deductAmt = Math.min(qty, target.amount);
  feedInventory[idx] = { ...target, amount: _round1(target.amount - deductAmt) };

  const feedHistory = [{
    id: 'FH-' + Date.now(),
    feedId: target.id,
    feedName: target.name,
    amount: deductAmt,
    unitPrice: target.unitPrice || 0,
    totalPrice: deductAmt * (target.unitPrice || 0),
    type: 'deduction',
    date: _historyDate(),
    note: stripTags(`${reason || 'Yem Çıkışı'} ${note ? '· ' + note : ''}`)
  }, ...(state.feedHistory || [])];

  setState({ feedInventory, feedHistory });
  return { success: true, message: `${target.name} stokundan ${deductAmt} ${target.unit} düşüldü ve kaydedildi.`, deductAmt };
}

/**
 * Rasyon kullanımını stoktan düşer.
 * @param {Object<string, number>} amountsByFeedId - { arpa: 20, saman: 15, ... }
 */
export function applyRation(amountsByFeedId) {
  const state = getState();
  const feedInventory = [...(state.feedInventory || [])];
  const feedHistory = [...(state.feedHistory || [])];
  const date = _historyDate();
  let totalUsed = 0;

  Object.entries(amountsByFeedId || {}).forEach(([feedId, raw]) => {
    const val = parseFloat(raw) || 0;
    if (val <= 0) return;
    const idx = feedInventory.findIndex(f => f.id === feedId);
    if (idx === -1) return;

    const available = feedInventory[idx].amount;
    const use = Math.min(val, available);
    feedInventory[idx] = { ...feedInventory[idx], amount: _round1(available - use) };
    totalUsed += use;

    feedHistory.unshift({
      id: 'FH-' + Date.now() + '-' + feedId,
      feedId,
      feedName: feedInventory[idx].name,
      amount: use,
      unitPrice: feedInventory[idx].unitPrice || 0,
      totalPrice: use * (feedInventory[idx].unitPrice || 0),
      type: 'ration',
      date,
      note: 'Rasyon Kullanımı'
    });
  });

  if (totalUsed === 0) return { success: false, message: 'Rasyon için en az bir yem miktarı giriniz.' };

  setState({ feedInventory, feedHistory });
  return { success: true, message: `Toplam ${totalUsed} kg/adet yem rasyon olarak kullanıldı ve stoktan düşüldü.`, totalUsed };
}
