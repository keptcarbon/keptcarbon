/**
 * KeptCarbon Authentication Manager
 * Handles user session using localStorage (demo/frontend-only)
 */

const Auth = {
  /**
   * Get current logged-in user object
   */
  getUser() {
    const userJson = localStorage.getItem('kc_user');
    return userJson ? JSON.parse(userJson) : null;
  },

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return !!this.getUser();
  },

  /**
   * Register a new user
   */
  register(userData) {
    const users = this.getAllUsers();
    // Check duplicate email
    if (users.find(u => u.email === userData.email)) {
      return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' };
    }
    const newUser = {
      id: Date.now().toString(),
      fullname: userData.fullname,
      email: userData.email,
      password: userData.password, // In production, hash this
      phone: userData.phone || '',
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    localStorage.setItem('kc_users', JSON.stringify(users));
    return { success: true, user: newUser };
  },

  /**
   * Login user
   */
  login(email, password) {
    const users = this.getAllUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      return { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }
    // Store session (exclude password)
    const sessionUser = { ...user };
    delete sessionUser.password;
    localStorage.setItem('kc_user', JSON.stringify(sessionUser));
    return { success: true, user: sessionUser };
  },

  /**
   * Logout current user
   */
  logout() {
    localStorage.removeItem('kc_user');
    window.location.href = 'index.html';
  },

  /**
   * Get all registered users
   */
  getAllUsers() {
    const usersJson = localStorage.getItem('kc_users');
    return usersJson ? JSON.parse(usersJson) : [];
  },

  /**
   * Update current user profile
   */
  updateProfile(updates) {
    const user = this.getUser();
    if (!user) return { success: false, message: 'ไม่ได้เข้าสู่ระบบ' };

    const users = this.getAllUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx === -1) return { success: false, message: 'ไม่พบผู้ใช้' };

    // Update in users array
    if (updates.fullname) users[idx].fullname = updates.fullname;
    if (updates.phone !== undefined) users[idx].phone = updates.phone;
    if (updates.newPassword) users[idx].password = updates.newPassword;

    localStorage.setItem('kc_users', JSON.stringify(users));

    // Update session 
    const updatedSession = { ...user, ...updates };
    delete updatedSession.newPassword;
    delete updatedSession.password;
    localStorage.setItem('kc_user', JSON.stringify(updatedSession));

    return { success: true };
  },

  /**
   * Require authentication - redirect to login if not logged in
   */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }
};

// ============================================================
// Plot Data Manager
// ============================================================
const PlotDB = {
  getPlots(userId) {
    const key = `kc_plots_${userId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  savePlot(userId, plot) {
    const plots = this.getPlots(userId);
    const existing = plots.findIndex(p => p.id === plot.id);
    if (existing >= 0) {
      plots[existing] = plot;
    } else {
      plots.push(plot);
    }
    localStorage.setItem(`kc_plots_${userId}`, JSON.stringify(plots));
    return plot;
  },

  deletePlot(userId, plotId) {
    let plots = this.getPlots(userId);
    plots = plots.filter(p => p.id !== plotId);
    localStorage.setItem(`kc_plots_${userId}`, JSON.stringify(plots));
  },

  getPlotById(userId, plotId) {
    return this.getPlots(userId).find(p => p.id === plotId);
  }
};
