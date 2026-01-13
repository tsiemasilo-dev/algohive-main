/**
 * Renders the Master Sidebar into the #layout container.
 * @param {string} activePage - 'home', 'portfolio', 'invest', or 'money'
 */
export function renderSidebar(activePage) {
    const layout = document.getElementById('layout');
    if (!layout) return;

    // 1. Sidebar HTML
    const sidebarHTML = `
    <div id="ah-overlay" class="fixed inset-0 bg-black/40 z-40 hidden md:hidden"></div>

    <aside id="ah-sidebar" data-collapsed="false"
      class="border-r border-slate-200 h-[100vh] bg-white flex flex-col overflow-y-auto fixed md:sticky top-0 z-50 w-[280px] md:w-[var(--sb)] transform -translate-x-full md:translate-x-0 transition-transform duration-300">
      
      <div class="px-4 py-3 flex items-center gap-3 border-b border-slate-200 h-[65px]">
        <img src="https://static.wixstatic.com/media/ac771e_af06d86a7a1f4abd87e52e45f3bcbd96~mv2.png"
          alt="AlgoHive Logo" class="w-10 h-10 object-contain" />
        <div class="min-w-0">
          <div class="font-bold text-[15px] text-slate-900 label">AlgoHive</div>
          <div class="text-[11px] text-slate-500 label">Where Smart Capital Gathers</div>
        </div>
      </div>

      <nav id="main-nav" class="p-1 text-[14px] flex-1">
        
        <a class="flex items-center gap-3 px-3 py-2 rounded-lg font-medium ${activePage === 'home' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}"
          href="/demo/dashboard.html">
          <i class="fa-solid fa-house w-4 shrink-0 ${activePage === 'home' ? 'text-slate-900' : 'text-slate-500'}"></i><span class="label">Home</span>
        </a>

        <details class="group mt-1" ${activePage === 'portfolio' ? 'open' : ''}>
          <summary class="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer font-medium text-slate-600">
            <span class="flex items-center gap-3">
              <i class="fa-regular fa-user w-4 text-slate-500"></i><span class="label">Portfolio</span>
            </span>
            <i class="fa-solid fa-chevron-down text-slate-400 group-open:rotate-180 transition-transform chevron"></i>
          </summary>
          <div class="ml-8 flex flex-col sub mt-1">
            <a class="px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-600" href="/demo/dashboard.html">
                <i class="fa-solid fa-chart-pie w-4 text-slate-500"></i><span class="label">My Strategies</span>
            </a>
           </div>
        </details>

        <details class="group mt-1" ${activePage === 'invest' ? 'open' : ''}>
          <summary class="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer font-medium text-slate-600">
            <span class="flex items-center gap-3">
              <i class="fa-solid fa-link w-4 text-slate-500"></i><span class="label">Invest</span>
            </span>
            <i class="fa-solid fa-chevron-down text-slate-400 group-open:rotate-180 transition-transform chevron"></i>
          </summary>
          <div class="ml-8 flex flex-col sub mt-1">
            <a class="px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 text-slate-600" href="/demo/strategies.html">
                <i class="fa-solid fa-chart-line w-4 text-slate-500"></i><span class="label">OpenStrategies</span>
            </a>
          </div>
        </details>

        <a class="mt-1 flex items-center gap-3 px-3 py-2 rounded-lg font-medium ${activePage === 'money' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}"
           href="/money/comingsoon.html">
           <i class="fa-solid fa-wallet w-4 shrink-0 ${activePage === 'money' ? 'text-slate-900' : 'text-slate-500'}"></i><span class="label">Money</span>
        </a>

        <a class="mt-1 flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-50" href="/news-insights.html">
          <i class="fa-solid fa-newspaper w-4 text-slate-500"></i><span class="label">News &amp; Insights</span>
        </a>

      </nav>

      <div class="p-2 border-t border-slate-200 footer flex items-center justify-between gap-2 bg-slate-50/50 mt-auto">
        <a href="/demo/settings.html" class="btn h-10 w-10 p-0 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 transition-colors">
            <i class="fa-solid fa-gear"></i>
        </a>
        <button id="ah-collapse" class="hidden md:flex h-10 w-10 p-0 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 items-center justify-center text-slate-500 transition-colors">
            <i class="fa-solid fa-arrow-left"></i>
        </button>
      </div>
    </aside>
    `;

    layout.insertAdjacentHTML('afterbegin', sidebarHTML);
    initSidebarLogic();
}

function initSidebarLogic() {
    const layout = document.getElementById('layout');
    const aside = document.getElementById('ah-sidebar');
    const btn = document.getElementById('ah-collapse');
    const overlay = document.getElementById('ah-overlay');
    const mobileBtn = document.getElementById('ah-mobile-menu-btn');

    // Restore State
    if (localStorage.getItem('ah_collapsed') === 'true') { 
        aside.setAttribute('data-collapsed', 'true'); 
        layout.classList.add('is-collapsed'); 
    }

    // Collapse Toggle
    btn?.addEventListener('click', () => {
        const isCollapsed = aside.getAttribute('data-collapsed') === 'true';
        if (!isCollapsed) aside.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open')); // Close accordions on collapse
        aside.setAttribute('data-collapsed', String(!isCollapsed));
        layout.classList.toggle('is-collapsed', !isCollapsed);
        localStorage.setItem('ah_collapsed', String(!isCollapsed));
    });

    // Mobile Menu
    const toggleMenu = (open) => {
        if(open) { aside.classList.add('is-open'); aside.classList.remove('-translate-x-full'); overlay?.classList.remove('hidden'); }
        else { aside.classList.remove('is-open'); aside.classList.add('-translate-x-full'); overlay?.classList.add('hidden'); }
    };

    mobileBtn?.addEventListener('click', () => toggleMenu(true));
    overlay?.addEventListener('click', () => toggleMenu(false));
    aside.querySelectorAll('a').forEach(l => l.addEventListener('click', () => window.innerWidth < 768 && toggleMenu(false)));
}
