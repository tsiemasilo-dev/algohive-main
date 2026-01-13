 // menu.js
window.initSidebar = function initSidebar(opts = {}) {
  const sidebar = document.getElementById('sidebar');
  const activeKey = opts.activeKey || sidebar?.dataset.active || 'dashboard';
  const navContainer = document.getElementById('navContainer');
  const collapseBtn = document.getElementById('collapseBtn');

  const menu = [
    { section: "Main", key: "main", items: [
      { key: "dashboard",        label: "Dashboard",         icon: "fa-gauge",            href: "/dashboard.html" },
      { key: "open-strategies",  label: "Open Strategies",   icon: "fa-cubes",            href: "/open-strategies.html" },
      { key: "portfolio",        label: "My Portfolio",      icon: "fa-chart-line",       href: "/portfolio.html" },
      { key: "funding",          label: "Funding",           icon: "fa-sack-dollar",     href: "/funding.html" },
      { key: "reports",          label: "Reports",           icon: "fa-file-invoice",     href: "/reports.html" },
    ]},
    { section: "Extras", key: "extras", items: [
      { key: "news",             label: "News & Insights",   icon: "fa-newspaper",        href: "/news-insights.html" },
      { key: "alerts",           label: "Notifications",     icon: "fa-bell",             href: "/alerts.html" },
    ]},
    { section: "Support", key: "support", items: [
      { key: "settings",         label: "Settings",          icon: "fa-gear",             href: "/settings.html" },
      { key: "help",             label: "Help",              icon: "fa-circle-question",  href: "/help.html" },
      { key: "logout",           label: "Logout",            icon: "fa-arrow-right-from-bracket", href: "/logout" },
    ]},
  ];

  function createGroup(sectionObj) {
    const group = document.createElement("div"); group.className = "mb-2";
    const header = document.createElement("button");
    header.className = "w-full flex items-center justify-between px-2 py-1";
    header.setAttribute("aria-expanded","true");

    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = sectionObj.section;

    const right = document.createElement("div");
    right.className = "label";
    right.innerHTML = '<i class="fa-solid fa-chevron-up chev text-xs"></i>';

    header.append(title,right);

    const body = document.createElement("div"); body.className = "group-body";
    const list = document.createElement("nav"); list.className = "space-y-1 px-0.5";

    sectionObj.items.forEach(item=>{
      const a = document.createElement("a");
      a.href = item.href || "#";
      a.className = "sidebar-link";
      a.title = item.label;
      if(item.key === activeKey) a.classList.add("active");
      a.innerHTML = `<i class="fa-solid ${item.icon}"></i><span class="label">${item.label}</span>`;
      list.appendChild(a);
    });

    body.appendChild(list);
    group.append(header, body);

    header.addEventListener("click", ()=>{
      const expanded = header.getAttribute("aria-expanded")==="true";
      header.setAttribute("aria-expanded", String(!expanded));
      const chev = header.querySelector(".chev");
      if(expanded){ body.style.maxHeight = "0px"; chev.classList.add("rot"); }
      else{ body.style.maxHeight = body.scrollHeight + "px"; chev.classList.remove("rot"); }
    });

    requestAnimationFrame(()=>{ body.style.maxHeight = body.scrollHeight + "px"; });
    return group;
  }

  function renderNav(){
    navContainer.innerHTML = "";
    menu.forEach(s => navContainer.appendChild(createGroup(s)));
  }

  renderNav();

  // Collapse
  let collapsed = false;
  if(collapseBtn){
    collapseBtn.addEventListener("click", ()=>{
      collapsed = !collapsed;
      sidebar.classList.toggle("is-collapsed", collapsed);
      collapseBtn.innerHTML = collapsed
        ? '<i class="fa-solid fa-angles-right text-sm"></i>'
        : '<i class="fa-solid fa-angles-left text-sm"></i>';
      try{ sessionStorage.setItem("ah_sidebar_collapsed", collapsed ? "1":"0"); }catch(e){}
    });
  }
  try{
    const saved = sessionStorage.getItem("ah_sidebar_collapsed");
    if(saved==="1"){
      collapsed = true;
      sidebar.classList.add("is-collapsed");
      if(collapseBtn) collapseBtn.innerHTML = '<i class="fa-solid fa-angles-right text-sm"></i>';
    }
  }catch(e){}
};
