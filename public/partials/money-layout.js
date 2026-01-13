export function renderMoneySidebar(activeTab) {
    // 1. HIDE GLOBAL ELEMENTS
    const globalSidebar = document.getElementById('ah-sidebar');
    const layout = document.getElementById('layout');
    const overlay = document.getElementById('ah-overlay');
    
    // Hide global sidebar so we don't have two navigation bars
    if (globalSidebar) globalSidebar.style.display = 'none'; 
    
    // Reset layout grid to allow full-width app
    if (layout) {
        layout.style.display = 'block'; 
        layout.style.height = '100vh';
        layout.style.overflow = 'hidden';
    }

    const container = document.querySelector('.money-app-container');
    if (!container) return;

    // 2. STYLING CONSTANTS
    const fontPrimary = 'Inter, sans-serif'; 
    const logoUrl = 'https://static.wixstatic.com/media/f82622_8fca267ad9a24716a4de0166215a620f~mv2.png';
    
    // Green Gradient for Back Button (Olive/Green with opacity)
    const backBtnStyle = 'background: linear-gradient(135deg, rgba(85, 107, 47, 0.85) 0%, rgba(63, 82, 34, 0.9) 100%); box-shadow: 0 4px 12px rgba(85, 107, 47, 0.15); backdrop-filter: blur(4px);';

    // States
    const activeClass = `bg-[#31005e] text-white shadow-md shadow-[#31005e]/20`;
    const lockedClass = `text-slate-400 opacity-60 cursor-not-allowed select-none bg-slate-50 border border-transparent`;

    // 3. SIDEBAR HTML
    const sidebarHTML = `
      <aside id="money-sidebar" 
             class="fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-slate-200/60 p-5 h-full transform -translate-x-full lg:translate-x-0 lg:static lg:flex flex-col transition-transform duration-300" 
             style="font-family: ${fontPrimary};">
        
        <div class="mb-6">
          <a href="/demo/dashboard.html" 
             class="w-full flex items-center justify-between text-white font-bold py-3 px-4 rounded-xl transition-all hover:opacity-90 hover:-translate-y-0.5 group"
             style="${backBtnStyle}">
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-chevron-left text-xs opacity-70 group-hover:-translate-x-1 transition-transform"></i>
                <span>AlgoHive</span>
            </div>
            <img src="https://static.wixstatic.com/media/ac771e_af06d86a7a1f4abd87e52e45f3bcbd96~mv2.png" class="w-5 h-5 object-contain opacity-80" />
          </a>
        </div>

        <div class="mb-8 px-2 flex justify-center lg:justify-start">
             <img src="${logoUrl}" class="h-10 w-auto object-contain" alt="AlgoMoney" />
        </div>

        <div class="space-y-8 flex-1 overflow-y-auto">
          
          <div>
            <p class="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Overview</p>
            <div class="space-y-1">
              <a href="/money/comingsoon.html" 
                 class="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'dashboard' ? activeClass : 'text-slate-500 hover:bg-slate-50'}">
                <i class="fa-solid fa-chart-simple w-5 text-center"></i>
                <span>Dashboard</span>
              </a>
              
              <div class="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${lockedClass}">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-chart-pie w-5 text-center"></i>
                    <span>Analytics</span>
                </div>
                <i class="fa-solid fa-lock text-[10px]"></i>
              </div>
            </div>
          </div>

          <div>
            <p class="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Finance</p>
            <div class="space-y-1">
              <div class="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${lockedClass}">
                <div class="flex items-center gap-3">
                    <i class="fa-solid fa-arrow-right-arrow-left w-5 text-center"></i>
                    <span>Transactions</span>
                </div>
                <i class="fa-solid fa-lock text-[10px]"></i>
              </div>
              <div class="flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${lockedClass}">
                <div class="flex items-center gap-3">
                    <i class="fa-regular fa-credit-card w-5 text-center"></i>
                    <span>Cards</span>
                </div>
                <i class="fa-solid fa-lock text-[10px]"></i>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-auto pt-4 border-t border-slate-100">
          <div class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
            <div class="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 grid place-items-center text-xs font-bold text-slate-600 group-hover:border-[#31005e] group-hover:text-[#31005e] transition-colors">D</div>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold text-slate-700 group-hover:text-slate-900">Demo User</div>
                <div class="text-[10px] text-slate-400 truncate">user@algohive.io</div>
            </div>
            <i class="fa-solid fa-arrow-right-from-bracket text-slate-300 hover:text-rose-500 transition-colors" title="Sign Out"></i>
          </div>
        </div>
      </aside>
    `;

    container.insertAdjacentHTML('afterbegin', sidebarHTML);

    // 4. MOBILE MENU LOGIC (HIJACK)
    const mobileBtn = document.getElementById('ah-mobile-menu-btn');
    const moneySidebar = document.getElementById('money-sidebar');
    
    if (overlay) overlay.style.display = 'none'; // Start hidden

    if (mobileBtn && moneySidebar) {
        // Clone the button to strip the event listener from layout.js
        const newBtn = mobileBtn.cloneNode(true);
        mobileBtn.parentNode.replaceChild(newBtn, mobileBtn);

        const toggleMoneyMenu = () => {
            const isOpen = !moneySidebar.classList.contains('-translate-x-full');
            if (isOpen) {
                moneySidebar.classList.add('-translate-x-full');
                if (overlay) overlay.style.display = 'none';
            } else {
                moneySidebar.classList.remove('-translate-x-full');
                if (overlay) overlay.style.display = 'block';
            }
        };

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMoneyMenu();
        });

        if (overlay) {
            const newOverlay = overlay.cloneNode(true);
            overlay.parentNode.replaceChild(newOverlay, overlay);
            
            newOverlay.addEventListener('click', () => {
                moneySidebar.classList.add('-translate-x-full');
                newOverlay.style.display = 'none';
            });
        }
    }
}
