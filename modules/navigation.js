/**
 * ShepherdAI — Bottom Navigation Bar Modülü
 */

import { navigateTo } from '../core/router.js';

const navItems = [
  {
    route: 'dashboard',
    label: 'Panel',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>`
  },
  {
    route: 'herd-list',
    label: 'Sürü',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2C8 2 6 5 6 8c0 2 1 3 2 4l-2 6h12l-2-6c1-1 2-2 2-4 0-3-2-6-6-6z"/>
      <path d="M9 8.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" fill="currentColor"/>
      <path d="M15 8.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" fill="currentColor"/>
      <path d="M10 22v-4M14 22v-4"/>
    </svg>`
  },
  {
    route: 'health',
    label: 'Sağlık',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>`
  },
  {
    route: 'finance',
    label: 'Finans',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>`
  },
  {
    route: 'tasks',
    label: 'Görevler',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>`
  },
  {
    route: 'profile',
    label: 'Profil',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>`
  }
];

/**
 * Navigation bar'ı render et ve DOM'a ekle
 */
export function renderNavBar() {
  const nav = document.getElementById('nav-bar');
  if (!nav) return;

  nav.innerHTML = navItems.map(item => `
    <button class="nav-btn" data-route="${item.route}" aria-label="${item.label}">
      ${item.icon}
      <span>${item.label}</span>
    </button>
  `).join('');

  // Event delegation
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) {
      navigateTo(btn.dataset.route);
    }
  });
}
