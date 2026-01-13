(function () {
  function wireSidebar() {
    const sidebar = document.getElementById('ah-sidebar');
    const overlay = document.getElementById('ah-overlay');
    const mobileBtn = document.getElementById('ah-mobile-menu-btn');
    const collapseBtn = document.getElementById('ah-collapse');
    const mobileIslands = document.querySelectorAll('[data-mobile-island]');

    const openSidebar = () => {
      sidebar?.classList.add('is-open');
      overlay?.classList.remove('hidden');
    };

    mobileBtn?.addEventListener('click', openSidebar);
    mobileIslands.forEach(btn => btn.addEventListener('click', openSidebar));

    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('is-open');
      overlay?.classList.add('hidden');
    });

    collapseBtn?.addEventListener('click', () => {
      const layout = document.getElementById('layout');
      const isCollapsed = sidebar?.dataset.collapsed === 'true';
      const next = !isCollapsed;
      sidebar.dataset.collapsed = String(next);
      layout?.classList.toggle('is-collapsed', next);
    });
  }

  function wireCardStack() {
    const stack = document.querySelector('[data-card-stack]');
    const cards = stack ? Array.from(stack.querySelectorAll('[data-card]')) : [];
    const sheet = document.getElementById('bank-sheet');
    const overlay = sheet?.querySelector('[data-bank-overlay]');
    const closeButtons = sheet ? Array.from(sheet.querySelectorAll('[data-bank-close]')) : [];
    const statementsSheet = document.getElementById('statements-sheet');
    const statementsOverlay = statementsSheet?.querySelector('[data-statements-overlay]');
    const statementsClose = statementsSheet ? Array.from(statementsSheet.querySelectorAll('[data-statements-close]')) : [];
    const statementsTrigger = document.querySelector('[data-statements-trigger]');
    const statementTitle = statementsSheet?.querySelector('[data-statement-title]');
    let hideTimeout;
    let statementsHideTimeout;

    if (!stack || !cards.length) return;

    let activeCard = cards.find((card) => card.dataset.cardActive === 'true') || cards[0];

    const updateStatementTitle = () => {
      if (!statementTitle || !activeCard) return;
      const name = activeCard.dataset.cardName || 'Account';
      const mask = activeCard.dataset.cardMask ? `• ${activeCard.dataset.cardMask}` : '';
      statementTitle.textContent = mask ? `${name} ${mask}` : name;
    };

    const setActiveCard = (nextCard) => {
      if (!nextCard || nextCard === activeCard) return;
      activeCard = nextCard;

      cards.forEach((card) => {
        const isActive = card === activeCard;
        card.classList.toggle('stack-front', isActive);
        card.classList.toggle('stack-back', !isActive);
        card.dataset.cardActive = String(isActive);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      updateStatementTitle();
    };

    updateStatementTitle();

    const openSheet = () => {
      if (!sheet) return;
      window.clearTimeout(hideTimeout);
      sheet.classList.remove('hidden');
      requestAnimationFrame(() => sheet.classList.add('is-open'));
    };

    const closeSheet = () => {
      if (!sheet) return;
      sheet.classList.remove('is-open');
      hideTimeout = window.setTimeout(() => sheet.classList.add('hidden'), 220);
    };

    const openStatementsSheet = () => {
      if (!statementsSheet) return;
      window.clearTimeout(statementsHideTimeout);
      updateStatementTitle();
      statementsSheet.classList.remove('hidden');
      requestAnimationFrame(() => statementsSheet.classList.add('is-open'));
    };

    const closeStatementsSheet = () => {
      if (!statementsSheet) return;
      statementsSheet.classList.remove('is-open');
      statementsHideTimeout = window.setTimeout(() => statementsSheet.classList.add('hidden'), 220);
    };

    cards.forEach((card) => {
      card.addEventListener('click', () => {
        setActiveCard(card);
      });
    });

    statementsTrigger?.addEventListener('click', openStatementsSheet);

    overlay?.addEventListener('click', closeSheet);
    closeButtons.forEach((btn) => btn.addEventListener('click', closeSheet));

    statementsOverlay?.addEventListener('click', closeStatementsSheet);
    statementsClose.forEach((btn) => btn.addEventListener('click', closeStatementsSheet));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeSheet();
        closeStatementsSheet();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireSidebar();
      wireCardStack();
    });
  } else {
    wireSidebar();
    wireCardStack();
  }
})();
