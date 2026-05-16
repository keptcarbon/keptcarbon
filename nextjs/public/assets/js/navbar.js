/**
 * KeptCarbon Dynamic Navbar
 * Renders different navbars based on authentication state
 */

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    renderNavbar();
  });

  function renderNavbar() {
    const user = Auth.getUser();
    const navmenu = document.getElementById('navmenu');
    const navButtons = document.getElementById('nav-buttons');
    if (!navmenu) return;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (!user) {
      // ─── Guest navbar ───
      navmenu.innerHTML = `
        <ul>
          <li><a href="index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>หน้าแรก</a></li>
          <li><a href="index.html#project-about">เกี่ยวกับโครงการ</a></li>
          <li><a href="index.html#team">ทีมงานของเรา</a></li>
          <li><a href="index.html#contact">ติดต่อเรา</a></li>
          <li class="d-xl-none"><div class="mobile-auth-divider"></div></li>
          <li class="d-xl-none">
            <div class="mobile-auth-buttons">
              <a class="mobile-btn-login" href="#" data-bs-toggle="modal" data-bs-target="#loginModal">
                เข้าสู่ระบบ
              </a>
            </div>
          </li>
        </ul>
        <i class="mobile-nav-toggle d-xl-none bi bi-list"></i>
      `;
      if (navButtons) {
        navButtons.innerHTML = `
          <a class="btn-getstarted" href="#" data-bs-toggle="modal" data-bs-target="#loginModal">เข้าสู่ระบบ</a>
        `;
      }
    } else {
      // ─── Authenticated navbar ───
      navmenu.innerHTML = `
        <ul>
          <li><a href="dashboard.html" ${currentPage === 'dashboard.html' ? 'class="active"' : ''}>แดชบอร์ด</a></li>
          <li><a href="map-draw.html" ${currentPage === 'map-draw.html' ? 'class="active"' : ''}>วาดแปลงยาง</a></li>
          <li><a href="my-plots.html" ${currentPage === 'my-plots.html' ? 'class="active"' : ''}>แปลงของฉัน</a></li>
          <li><a href="profile.html" ${currentPage === 'profile.html' ? 'class="active"' : ''}>โปรไฟล์</a></li>
          <li class="d-xl-none"><div class="mobile-auth-divider"></div></li>
          <li class="d-xl-none">
            <div class="mobile-auth-buttons">
              <div class="mobile-user-info">
                <i class="bi bi-person-circle"></i> ${user.fullname}
              </div>
              <a class="mobile-btn-logout" href="#" onclick="Auth.logout(); return false;">
                <i class="bi bi-box-arrow-right"></i> ออกจากระบบ
              </a>
            </div>
          </li>
        </ul>
        <i class="mobile-nav-toggle d-xl-none bi bi-list"></i>
      `;
      if (navButtons) {
        navButtons.innerHTML = `
          <span class="nav-username"><i class="bi bi-person-circle me-1"></i>${user.fullname}</span>
          <a class="btn-logout" href="#" onclick="Auth.logout(); return false;">ออกจากระบบ</a>
        `;
      }
    }

    // Re-bind mobile nav toggle after dynamic render
    bindMobileNavToggle();
  }

  function bindMobileNavToggle() {
    const btn = document.querySelector('.mobile-nav-toggle');
    if (!btn) return;

    // Mark as bound so main.js skips duplicate binding
    btn.dataset.bound = 'true';

    btn.addEventListener('click', function () {
      document.body.classList.toggle('mobile-nav-active');
      btn.classList.toggle('bi-list');
      btn.classList.toggle('bi-x-lg');
    });

    // Close on backdrop click
    const navmenu = document.getElementById('navmenu');
    if (navmenu) {
      navmenu.addEventListener('click', function (e) {
        const ul = navmenu.querySelector('ul');
        if (ul && !ul.contains(e.target) && !btn.contains(e.target) && document.body.classList.contains('mobile-nav-active')) {
          document.body.classList.remove('mobile-nav-active');
          btn.classList.add('bi-list');
          btn.classList.remove('bi-x-lg');
        }
      });
    }

    // Close on nav link click
    navmenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        if (document.body.classList.contains('mobile-nav-active')) {
          document.body.classList.remove('mobile-nav-active');
          btn.classList.add('bi-list');
          btn.classList.remove('bi-x-lg');
        }
      });
    });
  }
})();
